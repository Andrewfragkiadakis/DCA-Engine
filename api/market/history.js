// Monthly closing prices for one benchmark instrument. Used only by the Analytics
// benchmark line, which answers "what if every contribution had gone here instead".
//
// Deliberately narrow: an allowlist of EUR-denominated UCITS accumulating ETFs. The
// benchmark line compares against euro contributions, so a non-EUR series would need FX
// conversion per month to be honest, and the wrong number here silently discredits the
// whole comparison. Adding a symbol means confirming its trading currency first.
const CACHE = global.__historyCache || new Map();
global.__historyCache = CACHE;

const TTL_MS = 12 * 60 * 60 * 1000; // month-end closes change once a month
const MAX_MONTHS = 120;

const BENCHMARKS = {
  "VWCE": { twelveData: "VWCE.DE", currency: "EUR", label: "FTSE All-World (VWCE)" },
  "CSPX": { twelveData: "SXR8.DE", currency: "EUR", label: "S&P 500 (CSPX)" },
};

function json(res, code, payload) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function evictExpired(now) {
  for (const [key, entry] of CACHE) {
    if (entry.expiresAt <= now) CACHE.delete(key);
  }
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
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

  const key = String(req.query.benchmark || "VWCE").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const bench = BENCHMARKS[key];
  if (!bench) {
    return json(res, 400, {
      ok: false,
      error: `Unknown benchmark "${key}".`,
      available: Object.keys(BENCHMARKS),
    });
  }

  const months = Math.min(MAX_MONTHS, Math.max(2, parseInt(req.query.months, 10) || 60));
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    // A missing key is a configuration state, not a failure — the client hides the
    // benchmark line and says why, rather than showing an empty chart.
    return json(res, 200, {
      ok: false,
      reason: "no_api_key",
      error: "TWELVE_DATA_API_KEY is not set, so historical prices are unavailable.",
      benchmark: key,
    });
  }

  try {
    const now = Date.now();
    evictExpired(now);

    const cacheKey = `${key}:${months}`;
    const cached = CACHE.get(cacheKey);
    if (cached && cached.expiresAt > now) return json(res, 200, { ...cached.payload, cached: true });

    const url = "https://api.twelvedata.com/time_series"
      + `?symbol=${encodeURIComponent(bench.twelveData)}`
      + `&interval=1month&outputsize=${months}&order=ASC`
      + `&apikey=${encodeURIComponent(apiKey)}`;
    const data = await fetchJson(url);

    if (data?.status === "error" || !Array.isArray(data?.values)) {
      return json(res, 200, {
        ok: false,
        reason: "symbol_unresolved",
        error: data?.message || `Twelve Data returned no series for ${bench.twelveData}.`,
        benchmark: key,
        symbol: bench.twelveData,
      });
    }

    // Keyed YYYY-MM. Twelve Data returns one row per month at monthly interval; if it
    // ever returns several, the last one wins, which is the later close.
    const closes = {};
    for (const row of data.values) {
      const close = parseFloat(row?.close);
      const ym = typeof row?.datetime === "string" ? row.datetime.slice(0, 7) : null;
      if (ym && /^\d{4}-\d{2}$/.test(ym) && isFinite(close) && close > 0) closes[ym] = close;
    }

    if (!Object.keys(closes).length) {
      return json(res, 200, { ok: false, reason: "empty_series", error: "No usable closes in the response.", benchmark: key });
    }

    const payload = {
      ok: true,
      benchmark: key,
      label: bench.label,
      symbol: bench.twelveData,
      currency: bench.currency,
      closes,
      fetchedAt: new Date().toISOString(),
      source: "twelveData",
    };
    CACHE.set(cacheKey, { payload, expiresAt: now + TTL_MS });
    return json(res, 200, payload);
  } catch (error) {
    return json(res, 200, {
      ok: false,
      reason: "fetch_failed",
      error: error?.message || "History proxy error",
      benchmark: key,
    });
  }
};
