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

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, ch => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

// Self-contained dark error page. No external fonts, scripts or images, so it renders
// identically under the app's CSP and works even when the session is broken.
function renderErrorPage(res, { status, badge, title, message, steps = [], detail, retry = true }) {
  const stepsHtml = steps.length
    ? `<ol class="steps">${steps.map(s => `<li>${s}</li>`).join("")}</ol>`
    : "";
  const detailHtml = detail
    ? `<p class="detail"><span>Technical detail</span><code>${escapeHtml(detail)}</code></p>`
    : "";
  const retryHtml = retry
    ? `<a class="btn" href="/api/auth/login">Try signing in again</a>`
    : "";

  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow"/>
<title>${escapeHtml(title)} — DCA Engine</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:28px;
    background:#07090f;color:#f3f5f8;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;line-height:1.55}
  .glow{position:fixed;inset:0;pointer-events:none;
    background:radial-gradient(60% 45% at 50% 0%,rgba(139,147,248,.14),transparent 70%),
               radial-gradient(50% 40% at 80% 100%,rgba(52,211,153,.08),transparent 70%)}
  .card{position:relative;width:100%;max-width:540px;padding:40px 36px;border-radius:24px;
    background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02));
    border:1px solid rgba(255,255,255,.10);
    box-shadow:0 34px 70px -28px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.05)}
  .badge{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;
    background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.32);color:#fbbf24;
    font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;margin-bottom:22px}
  .dot{width:6px;height:6px;border-radius:50%;background:#fbbf24}
  h1{font-size:27px;font-weight:800;letter-spacing:-.7px;margin-bottom:12px}
  p.msg{color:#a7b0c0;font-size:15.5px}
  .steps{margin:22px 0 0;padding-left:20px;color:#a7b0c0;font-size:14.5px}
  .steps li{margin-bottom:9px}
  .steps li::marker{color:#8b93f8;font-weight:700}
  .steps b,p.msg b{color:#f3f5f8;font-weight:650}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;
    background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);
    padding:2px 7px;border-radius:6px;color:#cbd3e1;white-space:nowrap}
  .steps code,p.msg code{display:inline-block}
  .detail code{white-space:normal;overflow-wrap:anywhere}
  .detail{margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08);font-size:12.5px;color:#6b7486}
  .detail span{display:block;text-transform:uppercase;letter-spacing:1.4px;font-weight:700;font-size:10.5px;margin-bottom:7px}
  .btn{display:inline-block;margin-top:28px;padding:13px 24px;border-radius:12px;
    background:#6366f1;color:#fff;font-weight:700;font-size:14.5px;text-decoration:none;
    box-shadow:0 10px 24px -10px rgba(99,102,241,.8)}
  .btn:hover{background:#7c7ff5}
  @media (max-width:480px){.card{padding:30px 22px}h1{font-size:23px}}
</style></head>
<body><div class="glow"></div>
<div class="card">
  <div class="badge"><span class="dot"></span>${escapeHtml(badge)}</div>
  <h1>${escapeHtml(title)}</h1>
  <p class="msg">${message}</p>
  ${stepsHtml}
  ${retryHtml}
  ${detailHtml}
</div></body></html>`);
}

module.exports = { base64url, parseCookies, signSession, getBaseUrl, cookieString, renderErrorPage, escapeHtml };
