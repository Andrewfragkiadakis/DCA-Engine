const crypto = require("crypto");
const { getBaseUrl, cookieString } = require("./_lib");

module.exports = async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.statusCode = 500;
    res.end("Google SSO is not configured (missing GOOGLE_CLIENT_ID). See README for setup.");
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
