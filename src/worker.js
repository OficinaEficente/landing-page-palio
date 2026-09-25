const META_GRAPH_VERSION = "v21.0";

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
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
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
      user_data.firstName ? sha256(user_data.firstName) : undefined,
      user_data.email ? sha256(user_data.email) : undefined
    ]);

    const payload = {
      data: [{
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
      }],
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

    const result = await response.json();
    return json(result, response.ok ? 200 : 502);
  } catch (error) {
    console.error("CAPI error", error);
    return json({ error: "internal_error" }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/track") return handleTrack(request, env);

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
