const CACHE = global.__quotesCache || new Map();
global.__quotesCache = CACHE;

const TTL_MS = 60 * 1000;
const DEFAULT_SYMBOL_MAP = {
  BTC: { assetClass: "crypto", coingeckoId: "bitcoin", binanceSymbol: "BTCUSDT" },
  ETH: { assetClass: "crypto", coingeckoId: "ethereum", binanceSymbol: "ETHUSDT" },
  NVDA: { assetClass: "equity", twelveData: "NVDA", finnhub: "NVDA", polygon: "NVDA" },
  AAPL: { assetClass: "equity", twelveData: "AAPL", finnhub: "AAPL", polygon: "AAPL" },
  MSFT: { assetClass: "equity", twelveData: "MSFT", finnhub: "MSFT", polygon: "MSFT" },
  KO: { assetClass: "equity", twelveData: "KO", finnhub: "KO", polygon: "KO" },
  JNJ: { assetClass: "equity", twelveData: "JNJ", finnhub: "JNJ", polygon: "JNJ" },
  SPY: { assetClass: "equity", twelveData: "SPY", finnhub: "SPY", polygon: "SPY" },
  VWCE: { assetClass: "equity", twelveData: "VWCE.DE", finnhub: "VWCE.DE", polygon: "VWCE" },
  VHYL: { assetClass: "equity", twelveData: "VHYL.LON", finnhub: "VHYL.L", polygon: "VHYL" },
};

function json(res, code, payload) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sanitizeTicker(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9.&]/g, "")
    .slice(0, 12);
}

async function fetchJson(url, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || 7000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: opts.headers || {} });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function quoteFromCoinGecko(assets) {
  const idToTicker = {};
  for (const asset of assets) {
    if (asset.coingeckoId) idToTicker[asset.coingeckoId] = asset.ticker;
  }
  const ids = Object.keys(idToTicker);
  if (!ids.length) return {};

  const data = await fetchJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd&include_24hr_change=true`
  );

  const out = {};
  for (const [id, ticker] of Object.entries(idToTicker)) {
    const row = data[id];
    if (!row || typeof row.usd !== "number") continue;
    out[ticker] = {
      priceUsd: row.usd,
      dayChangePct: typeof row.usd_24h_change === "number" ? row.usd_24h_change : 0,
      source: "coingecko",
    };
  }
  return out;
}

async function quoteFromBinance(asset) {
  if (!asset.binanceSymbol) return null;
  const data = await fetchJson(`https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(asset.binanceSymbol)}`);
  const price = parseFloat(data.lastPrice);
  const change = parseFloat(data.priceChangePercent);
  if (!Number.isFinite(price)) return null;
  return { priceUsd: price, dayChangePct: Number.isFinite(change) ? change : 0, source: "binance" };
}

async function quoteFromTwelveData(asset) {
  if (!process.env.TWELVE_DATA_API_KEY || !asset.twelveData) return null;
  const data = await fetchJson(
    `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(asset.twelveData)}&apikey=${encodeURIComponent(process.env.TWELVE_DATA_API_KEY)}`
  );
  const price = parseFloat(data.close || data.price);
  const change = parseFloat(data.percent_change);
  if (!Number.isFinite(price)) return null;
  return { priceUsd: price, dayChangePct: Number.isFinite(change) ? change : 0, source: "twelve-data" };
}

async function quoteFromFinnhub(asset) {
  if (!process.env.FINNHUB_API_KEY || !asset.finnhub) return null;
  const data = await fetchJson(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(asset.finnhub)}&token=${encodeURIComponent(process.env.FINNHUB_API_KEY)}`
  );
  const price = parseFloat(data.c);
  const prev = parseFloat(data.pc);
  if (!Number.isFinite(price)) return null;
  const pct = Number.isFinite(prev) && prev > 0 ? ((price - prev) / prev) * 100 : 0;
  return { priceUsd: price, dayChangePct: pct, source: "finnhub" };
}

async function quoteFromPolygon(asset) {
  if (!process.env.POLYGON_API_KEY || !asset.polygon) return null;
  const data = await fetchJson(
    `https://api.polygon.io/v2/last/trade/${encodeURIComponent(asset.polygon)}?apiKey=${encodeURIComponent(process.env.POLYGON_API_KEY)}`
  );
  const price = parseFloat(data?.results?.p);
  if (!Number.isFinite(price)) return null;
  return { priceUsd: price, dayChangePct: 0, source: "polygon" };
}

async function quoteFromCoinMarketCap(asset) {
  if (!process.env.COINMARKETCAP_API_KEY) return null;
  const data = await fetchJson(
    `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(asset.ticker)}&convert=USD`,
    { headers: { "X-CMC_PRO_API_KEY": process.env.COINMARKETCAP_API_KEY } }
  );
  const row = data?.data?.[asset.ticker]?.[0]?.quote?.USD;
  if (!row || typeof row.price !== "number") return null;
  return {
    priceUsd: row.price,
    dayChangePct: typeof row.percent_change_24h === "number" ? row.percent_change_24h : 0,
    source: "coinmarketcap",
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  try {
    const body = req.method === "POST" ? (req.body || {}) : req.query;
    const assetsRaw = Array.isArray(body.assets) ? body.assets : [];
    const includeUnmapped = String(body.includeUnmapped || "false") === "true";

    const normalizedAssets = assetsRaw
      .map(item => ({
        ticker: sanitizeTicker(item?.ticker),
        cat: String(item?.cat || "Other"),
        map: item?.map && typeof item.map === "object" ? item.map : {},
      }))
      .filter(item => item.ticker);

    if (!normalizedAssets.length) return json(res, 400, { ok: false, error: "assets[] is required" });

    const cacheKey = JSON.stringify(normalizedAssets);
    const cached = CACHE.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return json(res, 200, { ...cached.payload, cached: true });
    }

    const mergedAssets = normalizedAssets.map(a => {
      const defaults = DEFAULT_SYMBOL_MAP[a.ticker] || {};
      const assetClass = a.cat === "Crypto" ? "crypto" : (defaults.assetClass || "equity");
      return { ticker: a.ticker, assetClass, ...defaults, ...a.map };
    });

    const quotes = {};
    const providerHealth = {
      coingecko: "not-used",
      binance: "not-used",
      twelveData: "not-used",
      finnhub: "not-used",
      polygon: "not-used",
      coinmarketcap: "not-used",
    };

    const cryptoAssets = mergedAssets.filter(a => a.assetClass === "crypto");
    const cgQuotes = await quoteFromCoinGecko(cryptoAssets).catch(() => {
      providerHealth.coingecko = "error";
      return {};
    });
    if (Object.keys(cgQuotes).length) providerHealth.coingecko = "ok";
    for (const [ticker, quote] of Object.entries(cgQuotes)) quotes[ticker] = quote;

    for (const asset of cryptoAssets) {
      if (quotes[asset.ticker]) continue;
      const cmc = await quoteFromCoinMarketCap(asset).catch(() => null);
      if (cmc) {
        providerHealth.coinmarketcap = "ok";
        quotes[asset.ticker] = cmc;
        continue;
      }
      const binance = await quoteFromBinance(asset).catch(() => null);
      if (binance) {
        providerHealth.binance = "ok";
        quotes[asset.ticker] = binance;
      }
    }

    const equityAssets = mergedAssets.filter(a => a.assetClass !== "crypto");
    for (const asset of equityAssets) {
      let quote = await quoteFromTwelveData(asset).catch(() => null);
      if (quote) providerHealth.twelveData = "ok";
      if (!quote) quote = await quoteFromFinnhub(asset).catch(() => null);
      if (quote && quote.source === "finnhub") providerHealth.finnhub = "ok";
      if (!quote) quote = await quoteFromPolygon(asset).catch(() => null);
      if (quote && quote.source === "polygon") providerHealth.polygon = "ok";

      if (quote) quotes[asset.ticker] = quote;
    }

    const unresolved = mergedAssets
      .filter(a => !quotes[a.ticker])
      .map(a => ({ ticker: a.ticker, assetClass: a.assetClass }));

    const payload = {
      ok: true,
      fetchedAt: new Date().toISOString(),
      ttlSec: Math.round(TTL_MS / 1000),
      providerHealth,
      quotes,
      unresolved: includeUnmapped ? unresolved : unresolved.slice(0, 6),
    };

    CACHE.set(cacheKey, { payload, expiresAt: now + TTL_MS });
    return json(res, 200, payload);
  } catch (error) {
    return json(res, 500, { ok: false, error: error?.message || "Quote proxy error" });
  }
};
