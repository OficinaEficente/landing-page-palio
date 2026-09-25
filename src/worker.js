const META_GRAPH_VERSION = "v21.0";
const DEFAULT_SOURCE_URL = "https://palio.oficinaeficiente.com.br/";
const DEFAULT_CONTENT_NAME = "Curso Reparo Caixa Direcao Palio";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function getCookie(header, name) {
  if (!header) return;
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function sha256(value) {
  const data = new TextEncoder().encode(String(value).trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseEventTime(value) {
  if (value === undefined || value === null || value === "") {
    return Math.floor(Date.now() / 1000);
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric > 1e12 ? numeric / 1000 : numeric);
  }

  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? Math.floor(Date.now() / 1000) : Math.floor(parsed / 1000);
}

function safeEqual(a, b) {
  const left = new TextEncoder().encode(String(a || ""));
  const right = new TextEncoder().encode(String(b || ""));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

function readBearerToken(request) {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function eventNameFrom(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "lead") return "Lead";
  if (normalized === "purchase") return "Purchase";
  return "";
}

async function sendMetaEvent(env, event) {
  const payload = {
    data: [event],
    ...(env.META_TEST_EVENT_CODE ? { test_event_code: env.META_TEST_EVENT_CODE } : {})
  };

  const response = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  const result = await response.json().catch(() => ({ error: { message: "invalid_meta_response" } }));
  return { response, result };
}

async function handleTrack(request, env) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) {
    return json({ skipped: true, reason: "meta_not_configured" });
  }

  try {
    const body = await request.json();
    const {
      event_name,
      event_id,
      event_source_url,
      custom_data = {},
      user_data = {}
    } = body || {};

    if (!event_name || !event_id) return json({ error: "invalid_event" }, 400);

    const cookieHeader = request.headers.get("cookie");
    const fbp = getCookie(cookieHeader, "_fbp");
    const fbc = getCookie(cookieHeader, "_fbc");
    const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "";
    const userAgent = request.headers.get("user-agent") || "";

    const [hashedPhone, hashedFirstName, hashedEmail] = await Promise.all([
      user_data.phone ? sha256(normalizePhone(user_data.phone)) : undefined,
      user_data.firstName ? sha256(normalizeText(user_data.firstName)) : undefined,
      user_data.email ? sha256(normalizeEmail(user_data.email)) : undefined
    ]);

    const event = {
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id,
      event_source_url,
      action_source: "website",
      user_data: {
        client_ip_address: clientIp,
        client_user_agent: userAgent,
        ...(fbp ? { fbp } : {}),
        ...(fbc ? { fbc } : {}),
        ...(hashedPhone ? { ph: [hashedPhone] } : {}),
        ...(hashedFirstName ? { fn: [hashedFirstName] } : {}),
        ...(hashedEmail ? { em: [hashedEmail] } : {})
      },
      custom_data
    };

    const { response, result } = await sendMetaEvent(env, event);
    return json(result, response.ok ? 200 : 502);
  } catch (error) {
    console.error("CAPI browser event error", error instanceof Error ? error.message : "unknown");
    return json({ error: "internal_error" }, 500);
  }
}

async function handleRioOneEvent(request, env) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env.RIOONE_WEBHOOK_SECRET) return json({ error: "rioone_secret_not_configured" }, 503);
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) return json({ error: "meta_not_configured" }, 503);

  const bearer = readBearerToken(request);
  if (!bearer || !safeEqual(bearer, env.RIOONE_WEBHOOK_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const body = await request.json();
    const eventName = eventNameFrom(body?.event_type || body?.event_name);
    const eventId = String(body?.event_id || "").trim();
    const consentMeta = body?.consent_meta ?? body?.meta_consent ?? body?.consentMeta;

    if (!eventName || !eventId) return json({ error: "invalid_event" }, 400);
    if (consentMeta === false) {
      return json({ delivered: true, skipped: true, reason: "meta_consent_missing", event_id: eventId });
    }

    const contact = body?.contact || {};
    const attribution = body?.meta_attribution || body?.attribution || {};
    const client = body?.client || {};
    const transaction = body?.transaction || {};

    const email = normalizeEmail(contact.email);
    const phone = normalizePhone(contact.phone || contact.whatsapp);
    const firstName = normalizeText(contact.first_name || contact.firstName);
    const lastName = normalizeText(contact.last_name || contact.lastName);
    const city = normalizeText(contact.city);
    const state = normalizeText(contact.state);
    const country = normalizeText(contact.country || "BR");
    const externalId = String(contact.id || contact.contact_id || "").trim();

    const hashed = await Promise.all([
      email ? sha256(email) : undefined,
      phone ? sha256(phone) : undefined,
      firstName ? sha256(firstName) : undefined,
      lastName ? sha256(lastName) : undefined,
      city ? sha256(city) : undefined,
      state ? sha256(state) : undefined,
      country ? sha256(country) : undefined,
      externalId ? sha256(externalId) : undefined
    ]);

    const [em, ph, fn, ln, ct, st, countryHash, externalIdHash] = hashed;
    const fbp = attribution.fbp || attribution._fbp;
    const fbc = attribution.fbc || attribution._fbc;
    const originalIp = client.ip || client.client_ip || client.ip_address || "";
    const originalUserAgent = client.user_agent || client.userAgent || "";
    const sourceUrl = body?.event_source_url || body?.landing_page_url || attribution.page_url || attribution.landing_page_url || DEFAULT_SOURCE_URL;

    const userData = {
      ...(em ? { em: [em] } : {}),
      ...(ph ? { ph: [ph] } : {}),
      ...(fn ? { fn: [fn] } : {}),
      ...(ln ? { ln: [ln] } : {}),
      ...(ct ? { ct: [ct] } : {}),
      ...(st ? { st: [st] } : {}),
      ...(countryHash ? { country: [countryHash] } : {}),
      ...(externalIdHash ? { external_id: [externalIdHash] } : {}),
      ...(fbp ? { fbp: String(fbp) } : {}),
      ...(fbc ? { fbc: String(fbc) } : {}),
      ...(originalIp ? { client_ip_address: String(originalIp) } : {}),
      ...(originalUserAgent ? { client_user_agent: String(originalUserAgent) } : {})
    };

    const customData = eventName === "Purchase"
      ? {
          value: Number(transaction.value ?? transaction.amount),
          currency: String(transaction.currency || "BRL").toUpperCase(),
          content_name: String(transaction.product_name || transaction.productName || DEFAULT_CONTENT_NAME),
          ...(transaction.product_id || transaction.productId ? { content_ids: [String(transaction.product_id || transaction.productId)] } : {}),
          content_type: "product",
          ...(transaction.id ? { order_id: String(transaction.id) } : {})
        }
      : {
          content_name: DEFAULT_CONTENT_NAME,
          ...(body?.form_key ? { form_key: String(body.form_key) } : {}),
          ...(body?.source || body?.source_site ? { source: String(body.source || body.source_site) } : {})
        };

    if (eventName === "Purchase" && (!Number.isFinite(customData.value) || customData.value < 0)) {
      return json({ error: "invalid_purchase_value", event_id: eventId }, 400);
    }

    const event = {
      event_name: eventName,
      event_time: parseEventTime(body?.event_time),
      event_id: eventId,
      event_source_url: sourceUrl,
      action_source: "website",
      user_data: userData,
      custom_data: customData
    };

    const { response, result } = await sendMetaEvent(env, event);

    console.log(JSON.stringify({
      type: "rioone_meta_delivery",
      event_name: eventName,
      event_id: eventId,
      meta_status: response.status,
      ok: response.ok
    }));

    if (!response.ok) {
      return json({ delivered: false, event_name: eventName, event_id: eventId, meta_status: response.status, meta: result }, 502);
    }

    return json({ delivered: true, event_name: eventName, event_id: eventId, meta_status: response.status });
  } catch (error) {
    console.error("Rio One CAPI error", error instanceof Error ? error.message : "unknown");
    return json({ error: "internal_error" }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/track") return handleTrack(request, env);
    if (url.pathname === "/api/rioone/events") return handleRioOneEvent(request, env);

    if (url.pathname === "/config.js") {
      const cfg = { metaPixelId: env.META_PIXEL_ID || "" };
      return new Response(`window.OE_CONFIG=${JSON.stringify(cfg)};`, {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "public, max-age=300"
        }
      });
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);

    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    if (url.pathname === "/og-palio.jpg") {
      headers.set("Content-Type", "image/jpeg");
      headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    } else if (url.pathname.match(/\.(css|js|svg|webp|png|jpg|jpeg|woff2)$/)) {
      headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
