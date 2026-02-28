const UNPROTECTED_PATH_PREFIXES = [
  "/favicon",
  "/icon-",
  "/site.webmanifest",
  "/apple-touch-icon",
  "/og-image",
];

function unauthorized() {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="DCA Engine", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

function decodeBasicAuth(headerValue) {
  if (!headerValue || !headerValue.startsWith("Basic ")) return null;
  try {
    const encoded = headerValue.slice(6).trim();
    const decoded = atob(encoded);
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return {
      username: decoded.slice(0, idx),
      password: decoded.slice(idx + 1),
    };
  } catch {
    return null;
  }
}

export default function middleware(request) {
  const { pathname } = new URL(request.url);

  if (pathname.startsWith("/api/")) {
    return;
  }

  if (UNPROTECTED_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return;
  }

  const expectedUsername = process.env.SITE_USERNAME;
  const expectedPassword = process.env.SITE_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    return unauthorized();
  }

  const creds = decodeBasicAuth(request.headers.get("authorization"));
  if (!creds) return unauthorized();

  if (creds.username !== expectedUsername || creds.password !== expectedPassword) {
    return unauthorized();
  }

  return;
}
