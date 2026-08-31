const LEGACY_SOURCE = "https://raw.githubusercontent.com/OficinaEficente/site_palio/main/index.html";
const OG_RANGE = "bytes=13235-193826";

async function serveOgImage() {
  const upstream = await fetch(LEGACY_SOURCE, { headers: { Range: OG_RANGE } });
  if (!upstream.ok || upstream.status !== 206) {
    return new Response("Preview unavailable", { status: 502 });
  }

  const base64 = (await upstream.text()).trim();
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return new Response(bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/og-palio.jpg") {
      return serveOgImage();
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);

    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    if (url.pathname.match(/\.(css|js|svg|webp|png|jpg|jpeg|woff2)$/)) {
      headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
