const crypto = require("crypto");
const { getBaseUrl, cookieString, renderErrorPage } = require("./_lib");

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
    renderErrorPage(res, {
      status: 500,
      badge: "Setup incomplete",
      title: "Sign-in isn't configured yet",
      message: `The server is missing ${missing.length === 1 ? "an environment variable" : "some environment variables"} needed for Google sign-in.`,
      steps: [
        `Open <b>Vercel → your project → Settings → Environment Variables</b>.`,
        `Add ${missing.map(m => `<code>${m}</code>`).join(", ")} for the <b>Production</b> environment.`,
        `Redeploy — Vercel does not apply new variables to an existing build.`,
      ],
      retry: false,
    });
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
