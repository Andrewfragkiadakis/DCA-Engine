const crypto = require("crypto");

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseCookies(cookieHeader) {
  const out = {};
  String(cookieHeader || "").split(";").forEach(part => {
    const idx = part.indexOf("=");
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

// Session token format: <base64url(JSON payload)>.<base64url(HMAC-SHA256 signature)>
// Verified in middleware.js using the Web Crypto API (Edge runtime) against the same secret.
function signSession(payload, secret) {
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  return `${payloadB64}.${base64url(sig)}`;
}

function getBaseUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || (String(host).startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function cookieString(name, value, { maxAge } = {}) {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", "Secure"];
  parts.push(`Max-Age=${maxAge != null ? maxAge : 0}`);
  return parts.join("; ");
}

module.exports = { base64url, parseCookies, signSession, getBaseUrl, cookieString };
