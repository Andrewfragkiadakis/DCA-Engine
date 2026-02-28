const DEFAULT_SYMBOL_MAP = {
  BTC: { coingeckoId: "bitcoin", binanceSymbol: "BTCUSDT", assetClass: "crypto" },
  ETH: { coingeckoId: "ethereum", binanceSymbol: "ETHUSDT", assetClass: "crypto" },
  NVDA: { twelveData: "NVDA", finnhub: "NVDA", polygon: "NVDA", assetClass: "equity" },
  AAPL: { twelveData: "AAPL", finnhub: "AAPL", polygon: "AAPL", assetClass: "equity" },
  MSFT: { twelveData: "MSFT", finnhub: "MSFT", polygon: "MSFT", assetClass: "equity" },
  KO: { twelveData: "KO", finnhub: "KO", polygon: "KO", assetClass: "equity" },
  JNJ: { twelveData: "JNJ", finnhub: "JNJ", polygon: "JNJ", assetClass: "equity" },
  SPY: { twelveData: "SPY", finnhub: "SPY", polygon: "SPY", assetClass: "equity" },
  VWCE: { twelveData: "VWCE.DE", finnhub: "VWCE.DE", polygon: "VWCE", assetClass: "equity" },
  VHYL: { twelveData: "VHYL.LON", finnhub: "VHYL.L", polygon: "VHYL", assetClass: "equity" },
};

const FX_SYMBOLS = ["USD", "EUR", "GBP", "CHF"];

function safeParseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function sanitizeTicker(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9.&]/g, "").slice(0, 12);
}

export function getSymbolMapForTicker(ticker) {
  return DEFAULT_SYMBOL_MAP[sanitizeTicker(ticker)] || {};
}

export async function fetchLiveQuotes(assets) {
  const payload = {
    assets: assets.map(a => ({
      ticker: sanitizeTicker(a.ticker),
      cat: a.cat,
      map: getSymbolMapForTicker(a.ticker),
    })),
  };

  const res = await fetch("/api/market/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Quotes API error (${res.status})`);
  const text = await res.text();
  const data = safeParseJson(text);
  if (!data?.ok) throw new Error(data?.error || "Quotes API returned invalid payload");
  return data;
}

export async function fetchFxRates(base = "USD") {
  const q = new URLSearchParams({ base, symbols: FX_SYMBOLS.join(",") }).toString();
  const res = await fetch(`/api/market/fx?${q}`);
  if (!res.ok) throw new Error(`FX API error (${res.status})`);
  const data = await res.json();
  if (!data?.ok) throw new Error(data?.error || "FX API returned invalid payload");
  return data;
}

export function buildLiveModel({ assets, quotesData, fxData, currency, baselineTotal }) {
  const quotes = quotesData?.quotes || {};
  const rates = fxData?.rates || { USD: 1 };
  const usdToCurrency = rates[currency] || 1;

  const rows = assets.map(asset => {
    const quote = quotes[asset.ticker] || null;
    const dayChangePct = quote?.dayChangePct || 0;
    const liveValue = asset.current * (1 + dayChangePct / 100);
    const dailyPnl = liveValue - asset.current;
    const livePriceInCurrency = quote?.priceUsd ? quote.priceUsd * usdToCurrency : null;
    return {
      ticker: asset.ticker,
      name: asset.name,
      cat: asset.cat,
      source: quote?.source || "none",
      dayChangePct,
      baseValue: asset.current,
      liveValue,
      dailyPnl,
      quotePrice: livePriceInCurrency,
    };
  });

  const totalBase = assets.reduce((sum, a) => sum + a.current, 0);
  const totalLive = rows.reduce((sum, r) => sum + r.liveValue, 0);
  const dailyPnl = totalLive - totalBase;
  const dailyPnlPct = totalBase > 0 ? (dailyPnl / totalBase) * 100 : 0;

  const baseline = Number.isFinite(baselineTotal) && baselineTotal > 0 ? baselineTotal : totalBase;
  const totalReturn = totalLive - baseline;
  const totalReturnPct = baseline > 0 ? (totalReturn / baseline) * 100 : 0;

  const contributions = rows
    .map(r => ({
      ticker: r.ticker,
      name: r.name,
      dailyPnl: r.dailyPnl,
      contributionPct: Math.abs(dailyPnl) > 0 ? (r.dailyPnl / dailyPnl) * 100 : 0,
    }))
    .sort((a, b) => Math.abs(b.dailyPnl) - Math.abs(a.dailyPnl));

  return {
    rows,
    totalBase,
    totalLive,
    dailyPnl,
    dailyPnlPct,
    totalReturn,
    totalReturnPct,
    contributions,
    fetchedAt: quotesData?.fetchedAt || new Date().toISOString(),
    unresolved: quotesData?.unresolved || [],
    providerHealth: quotesData?.providerHealth || {},
  };
}

export function pushLocalSnapshot(existingSnapshots, liveModel, currency) {
  const snap = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    capturedAt: new Date().toISOString(),
    currency,
    totalValue: Math.round(liveModel.totalLive * 100) / 100,
    dailyPnl: Math.round(liveModel.dailyPnl * 100) / 100,
    dailyPnlPct: Math.round(liveModel.dailyPnlPct * 100) / 100,
  };
  const list = [...(existingSnapshots || []), snap].slice(-300);
  return { snap, list };
}

export async function persistSnapshotRemote(snapshot) {
  try {
    const res = await fetch("/api/market/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "dca-engine", snapshot }),
    });
    const data = await res.json();
    return data;
  } catch (error) {
    return { ok: false, error: error?.message || "Snapshot persist failed" };
  }
}
