const crypto = require("crypto");
const { getBaseUrl, cookieString } = require("./_lib");

module.exports = async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  // Fail here rather than sending the user to Google only to break on the callback.
  const missing = [
    !clientId && "GOOGLE_CLIENT_ID",
    !process.env.GOOGLE_CLIENT_SECRET && "GOOGLE_CLIENT_SECRET",
    !process.env.SESSION_SECRET && "SESSION_SECRET",
    !String(process.env.ALLOWED_EMAIL || "").trim() && "ALLOWED_EMAIL",
  ].filter(Boolean);

  if (missing.length) {
    res.statusCode = 500;
    res.end(
      `Google sign-in is not fully configured. Missing environment variable(s): ${missing.join(", ")}.\n` +
      `Add them in Vercel → Project → Settings → Environment Variables (Production), then redeploy.`
    );
    return;
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${getBaseUrl(req)}/api/auth/callback`;

  res.setHeader("Set-Cookie", cookieString("oauth_state", state, { maxAge: 600 }));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  res.end();
};
