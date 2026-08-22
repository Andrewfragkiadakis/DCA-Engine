const DEFAULT_SYMBOL_MAP = {
  BTC: { coingeckoId: "bitcoin", binanceSymbol: "BTCUSDT", assetClass: "crypto" },
  ETH: { coingeckoId: "ethereum", binanceSymbol: "ETHUSDT", assetClass: "crypto" },
  NVDA: { twelveData: "NVDA", finnhub: "NVDA", polygon: "NVDA", assetClass: "equity", currency: "USD" },
  AAPL: { twelveData: "AAPL", finnhub: "AAPL", polygon: "AAPL", assetClass: "equity", currency: "USD" },
  MSFT: { twelveData: "MSFT", finnhub: "MSFT", polygon: "MSFT", assetClass: "equity", currency: "USD" },
  KO: { twelveData: "KO", finnhub: "KO", polygon: "KO", assetClass: "equity", currency: "USD" },
  JNJ: { twelveData: "JNJ", finnhub: "JNJ", polygon: "JNJ", assetClass: "equity", currency: "USD" },
  SPY: { twelveData: "SPY", finnhub: "SPY", polygon: "SPY", assetClass: "equity", currency: "USD" },
  VWCE: { twelveData: "VWCE.DE", finnhub: "VWCE.DE", polygon: "VWCE", assetClass: "equity", currency: "EUR" },
  VHYL: { twelveData: "VHYL.LON", finnhub: "VHYL.L", polygon: "VHYL", assetClass: "equity", currency: "GBp" },
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

// Convert a price quoted in `from` currency to `to` currency, given rates that are
// all relative to the same base (rates[X] = units of X per 1 base unit).
export function convertPrice(price, from, to, rates) {
  if (price == null) return null;
  const fromCode = from || "USD";
  const toCode = to || "USD";
  if (fromCode === toCode) return price;
  const fromRate = rates?.[fromCode];
  const toRate = rates?.[toCode];
  if (!fromRate || !toRate) return null;
  return (price / fromRate) * toRate;
}

export function buildLiveModel({ assets, quotesData, fxData, currency }) {
  const quotes = quotesData?.quotes || {};
  const rates = fxData?.rates || { USD: 1 };

  const rows = assets.map(asset => {
    const quote = quotes[asset.ticker] || null;
    const dayChangePct = quote?.dayChangePct || 0;
    const livePriceInCurrency = quote?.price != null
      ? convertPrice(quote.price, quote.currency, currency, rates)
      : null;

    // If holdings are set and we have a live price, compute real value
    const hasHoldings = asset.holdings != null && asset.holdings > 0 && livePriceInCurrency != null;
    const liveValue = hasHoldings
      ? asset.holdings * livePriceInCurrency
      : asset.current * (1 + dayChangePct / 100);
    const baseValue = hasHoldings ? liveValue / (1 + dayChangePct / 100) : asset.current;
    const dailyPnl = liveValue - baseValue;
    const costBasis = asset.costBasis != null ? asset.costBasis : baseValue;

    return {
      ticker: asset.ticker,
      name: asset.name,
      cat: asset.cat,
      source: quote?.source || "none",
      dayChangePct,
      baseValue,
      liveValue,
      dailyPnl,
      costBasis,
      quotePrice: livePriceInCurrency,
      holdings: asset.holdings,
      holdingsComputed: hasHoldings,
    };
  });

  const totalBase = rows.reduce((sum, r) => sum + r.baseValue, 0);
  const totalLive = rows.reduce((sum, r) => sum + r.liveValue, 0);
  const dailyPnl = totalLive - totalBase;
  const dailyPnlPct = totalBase > 0 ? (dailyPnl / totalBase) * 100 : 0;

  // Total Return = live value vs. actual money invested (cost basis), not vs. an
  // arbitrary "since live tracking was enabled" snapshot.
  const totalCostBasis = rows.reduce((sum, r) => sum + r.costBasis, 0);
  const totalReturn = totalLive - totalCostBasis;
  const totalReturnPct = totalCostBasis > 0 ? (totalReturn / totalCostBasis) * 100 : 0;

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
