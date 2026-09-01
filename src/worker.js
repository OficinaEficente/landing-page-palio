export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
