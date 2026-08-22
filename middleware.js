const UNPROTECTED_PATH_PREFIXES = [
  "/favicon",
  "/icon-",
  "/site.webmanifest",
  "/apple-touch-icon",
  "/og-image",
  "/robots.txt",
];

function base64urlToBytes(b64url) {
  const pad = (4 - (b64url.length % 4)) % 4;
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

// Verifies the HMAC-SHA256-signed session cookie issued by /api/auth/callback.js.
// Same signing scheme, verified here with Web Crypto since Edge Middleware has no
// access to Node's `crypto` module.
async function verifySession(cookieHeader, secret) {
  if (!secret) return null;
  const token = readCookie(cookieHeader, "session");
  if (!token) return null;

  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlToBytes(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(payloadB64)));
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export default async function middleware(request) {
  const { pathname } = new URL(request.url);

  if (pathname.startsWith("/api/auth/")) return;
  if (UNPROTECTED_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))) return;

  const secret = process.env.SESSION_SECRET;
  const session = await verifySession(request.headers.get("cookie"), secret);
  if (session) return;

  if (pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  return Response.redirect(new URL("/api/auth/login", request.url), 302);
}
