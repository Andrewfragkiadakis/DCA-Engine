const { parseCookies, signSession, getBaseUrl, cookieString } = require("./_lib");

const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* leave null */ }
  return { ok: res.ok, data };
}

module.exports = async function handler(req, res) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const sessionSecret = process.env.SESSION_SECRET;
    const allowedEmail = String(process.env.ALLOWED_EMAIL || "").toLowerCase().trim();

    // Name exactly which variables are missing — a generic "not configured" message
    // is painful to debug. Names only, never values.
    const missing = [
      !clientId && "GOOGLE_CLIENT_ID",
      !clientSecret && "GOOGLE_CLIENT_SECRET",
      !sessionSecret && "SESSION_SECRET",
      !allowedEmail && "ALLOWED_EMAIL",
    ].filter(Boolean);

    if (missing.length) {
      res.statusCode = 500;
      res.end(
        `Google sign-in is not fully configured. Missing environment variable(s): ${missing.join(", ")}.\n` +
        `Add them in Vercel → Project → Settings → Environment Variables (Production), then redeploy.`
      );
      return;
    }

    const url = new URL(req.url, getBaseUrl(req));
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookies = parseCookies(req.headers.cookie);

    if (!code || !state || !cookies.oauth_state || state !== cookies.oauth_state) {
      res.statusCode = 401;
      res.end("Invalid or expired login attempt — please try signing in again.");
      return;
    }

    const redirectUri = `${getBaseUrl(req)}/api/auth/callback`;
    const tokenResult = await fetchJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    const accessToken = tokenResult.data?.access_token;
    if (!tokenResult.ok || !accessToken) {
      res.statusCode = 401;
      res.end("Google sign-in failed during token exchange.");
      return;
    }

    const userResult = await fetchJson("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const email = String(userResult.data?.email || "").toLowerCase().trim();
    const emailVerified = userResult.data?.email_verified === true || userResult.data?.email_verified === "true";

    if (!userResult.ok || !email || !emailVerified || email !== allowedEmail) {
      res.statusCode = 403;
      res.setHeader("Set-Cookie", cookieString("oauth_state", "", { maxAge: 0 }));
      res.end("Access denied — this Google account is not authorized for this app.");
      return;
    }

    const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
    const session = signSession({ email, exp }, sessionSecret);

    res.setHeader("Set-Cookie", [
      cookieString("session", session, { maxAge: SESSION_MAX_AGE_SEC }),
      cookieString("oauth_state", "", { maxAge: 0 }),
    ]);
    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (error) {
    res.statusCode = 500;
    res.end(`Authentication error: ${error?.message || "unknown"}`);
  }
};
