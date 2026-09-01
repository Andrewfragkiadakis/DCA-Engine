const { parseCookies, signSession, getBaseUrl, cookieString, renderErrorPage } = require("./_lib");

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
      renderErrorPage(res, {
        status: 500,
        badge: "Setup incomplete",
        title: "Sign-in isn't configured yet",
        message: `The server is missing ${missing.length === 1 ? "an environment variable" : "some environment variables"} needed to complete Google sign-in.`,
        steps: [
          `Open <b>Vercel → your project → Settings → Environment Variables</b>.`,
          `Add ${missing.map(m => `<code>${m}</code>`).join(", ")} for the <b>Production</b> environment.`,
          `Redeploy — Vercel does not apply new variables to an existing build.`,
        ],
        retry: false,
      });
      return;
    }

    const url = new URL(req.url, getBaseUrl(req));
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const googleError = url.searchParams.get("error");
    const cookies = parseCookies(req.headers.cookie);

    // Google bounced the user back without an authorization code. Overwhelmingly this
    // means the OAuth app is still in Testing and the account isn't a listed test user,
    // so say that plainly instead of blaming an "expired" attempt.
    if (googleError) {
      const consentIssue = googleError === "access_denied" || googleError === "admin_policy_enforced";
      renderErrorPage(res, {
        status: 403,
        badge: consentIssue ? "Not approved" : "Google declined",
        title: consentIssue ? "Google didn't approve this account" : "Google couldn't complete sign-in",
        message: consentIssue
          ? `Your OAuth app is in <b>Testing</b> mode, so only accounts listed as test users can sign in — or you dismissed the consent screen.`
          : `Google returned an error before sign-in could finish.`,
        steps: consentIssue ? [
          `Open <b>Google Cloud Console → APIs &amp; Services → OAuth consent screen</b>.`,
          `Under <b>Test users</b>, add the Google account you're signing in with, then retry.`,
          `Alternatively click <b>Publish app</b> to allow any Google account (the <code>ALLOWED_EMAIL</code> check still restricts access to you).`,
          `If you simply hit <b>Cancel</b> on Google's screen, just try again and approve it.`,
        ] : [
          `Confirm the redirect URI in Google Cloud is exactly <code>${getBaseUrl(req)}/api/auth/callback</code>.`,
          `Check that the OAuth client is of type <b>Web application</b> and is not deleted or disabled.`,
        ],
        detail: `google error: ${googleError}`,
      });
      return;
    }

    if (!code || !state || !cookies.oauth_state || state !== cookies.oauth_state) {
      const noCookie = !cookies.oauth_state;
      renderErrorPage(res, {
        status: 401,
        badge: "Session mismatch",
        title: noCookie ? "Your login session expired" : "That login link didn't match",
        message: noCookie
          ? `The short-lived cookie that protects the sign-in flow was missing or had expired. This is normal if the tab sat idle for a while, or if you opened this link directly.`
          : `The security token in the link didn't match the one stored in your browser, so the attempt was rejected.`,
        steps: [
          `Start again from the button below — don't reuse an old <code>/api/auth/callback</code> URL or bookmark.`,
          `Make sure cookies aren't blocked for this site (private windows and strict tracking protection can drop them).`,
        ],
        detail: `code=${code ? "present" : "missing"} state=${state ? "present" : "missing"} cookie=${cookies.oauth_state ? "present" : "missing"}`,
      });
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
      const gErr = tokenResult.data?.error;
      const mismatch = gErr === "redirect_uri_mismatch";
      renderErrorPage(res, {
        status: 401,
        badge: "Handshake failed",
        title: mismatch ? "The redirect URI doesn't match" : "Google rejected the sign-in",
        message: mismatch
          ? `Google will only complete sign-in if the redirect URI registered for your OAuth client matches this app exactly.`
          : `Google accepted the login but refused to exchange it for a token. This is almost always a credentials or redirect-URI problem.`,
        steps: [
          `In <b>Google Cloud → Credentials</b>, open your OAuth client.`,
          `Set an authorized redirect URI of exactly <code>${getBaseUrl(req)}/api/auth/callback</code> — no trailing slash.`,
          `Confirm <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in Vercel belong to <b>that same</b> client, then redeploy.`,
        ],
        detail: gErr ? `google error: ${gErr}${tokenResult.data?.error_description ? ` — ${tokenResult.data.error_description}` : ""}` : "token endpoint returned no access_token",
      });
      return;
    }

    const userResult = await fetchJson("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const email = String(userResult.data?.email || "").toLowerCase().trim();
    const emailVerified = userResult.data?.email_verified === true || userResult.data?.email_verified === "true";

    if (!userResult.ok || !email || !emailVerified || email !== allowedEmail) {
      res.setHeader("Set-Cookie", cookieString("oauth_state", "", { maxAge: 0 }));
      const unverified = email && !emailVerified;
      renderErrorPage(res, {
        status: 403,
        badge: "Access denied",
        title: unverified ? "That Google account isn't verified" : "This account isn't on the allow-list",
        message: unverified
          ? `Google reports this address as unverified, so it can't be used to sign in.`
          : `Sign-in with Google worked, but this app only admits one specific account.`,
        steps: unverified ? [
          `Verify the email address on the Google account, or sign in with a different one.`,
        ] : [
          `Sign in with the account set in <code>ALLOWED_EMAIL</code>.`,
          `To change who has access, update <code>ALLOWED_EMAIL</code> in <b>Vercel → Settings → Environment Variables</b> and redeploy.`,
          `Watch for typos and stray whitespace — the comparison is exact (case-insensitive).`,
        ],
        detail: email ? `signed in as: ${email}` : "userinfo returned no email",
      });
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
    renderErrorPage(res, {
      status: 500,
      badge: "Unexpected error",
      title: "Something broke during sign-in",
      message: `The server hit an unexpected error while completing your Google sign-in. Trying again usually clears it.`,
      steps: [
        `Retry with the button below.`,
        `If it keeps happening, check the function logs in <b>Vercel → Deployments → Functions</b>.`,
      ],
      detail: error?.message || "unknown error",
    });
  }
};
