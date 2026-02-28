const CACHE = global.__fxCache || new Map();
global.__fxCache = CACHE;

const TTL_MS = 90 * 1000;

function json(res, code, payload) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sanitizeCode(raw) {
  return String(raw || "USD").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "USD";
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });

  try {
    const base = sanitizeCode(req.query.base || "USD");
    const symbolsRaw = String(req.query.symbols || "EUR,USD,GBP,CHF").split(",");
    const symbols = [...new Set(symbolsRaw.map(sanitizeCode).filter(Boolean))].slice(0, 10);

    const cacheKey = `${base}:${symbols.join(",")}`;
    const now = Date.now();
    const cached = CACHE.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return json(res, 200, { ...cached.payload, cached: true });
    }

    const toParam = symbols.filter(s => s !== base).join(",") || "USD";
    const data = await fetchJson(`https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(toParam)}`);

    const rates = { [base]: 1, ...(data?.rates || {}) };
    for (const symbol of symbols) {
      if (!(symbol in rates)) rates[symbol] = symbol === base ? 1 : null;
    }

    const payload = {
      ok: true,
      base,
      rates,
      fetchedAt: new Date().toISOString(),
      ttlSec: Math.round(TTL_MS / 1000),
      source: "frankfurter",
    };

    CACHE.set(cacheKey, { payload, expiresAt: now + TTL_MS });
    return json(res, 200, payload);
  } catch (error) {
    return json(res, 500, { ok: false, error: error?.message || "FX proxy error" });
  }
};
