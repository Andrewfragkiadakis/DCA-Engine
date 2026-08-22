import { describe, it, expect } from "vitest";
import { convertPrice, buildLiveModel } from "./marketData";

// USD-based rates as returned by /api/market/fx?base=USD (Frankfurter-style: rates[X] = X per 1 USD)
const RATES = { USD: 1, EUR: 0.92, GBP: 0.79, CHF: 0.88 };

describe("convertPrice", () => {
  it("passes through when currencies match", () => {
    expect(convertPrice(100, "EUR", "EUR", RATES)).toBe(100);
  });
  it("converts USD to EUR using the cross rate", () => {
    expect(convertPrice(100, "USD", "EUR", RATES)).toBeCloseTo(92, 5);
  });
  it("converts GBP to EUR using the cross rate (not treated as USD)", () => {
    // Regression test: VHYL/VWCE used to be multiplied by the USD rate regardless
    // of their real listing currency, silently distorting live values.
    const result = convertPrice(10, "GBP", "EUR", RATES);
    expect(result).toBeCloseTo(10 * (0.92 / 0.79), 5);
  });
  it("returns null when a rate is missing", () => {
    expect(convertPrice(100, "JPY", "EUR", RATES)).toBeNull();
  });
});

describe("buildLiveModel", () => {
  const fxData = { rates: RATES };

  it("computes live value from holdings × price in the asset's real currency, not USD", () => {
    // VHYL is quoted in GBp (pence) upstream — quotes.js normalizes it to GBP before
    // this layer ever sees it, so buildLiveModel should treat a GBP quote as GBP.
    const assets = [{ ticker: "VHYL", name: "Hi Div ETF", cat: "ETF", current: 100, holdings: 10 }];
    const quotesData = { quotes: { VHYL: { price: 25, currency: "GBP", dayChangePct: 0, source: "finnhub" } } };
    const model = buildLiveModel({ assets, quotesData, fxData, currency: "EUR" });
    const expectedPriceInEur = 25 * (RATES.EUR / RATES.GBP);
    expect(model.rows[0].quotePrice).toBeCloseTo(expectedPriceInEur, 5);
    expect(model.rows[0].liveValue).toBeCloseTo(10 * expectedPriceInEur, 5);
  });

  it("falls back to dayChangePct-based estimate when holdings aren't set", () => {
    const assets = [{ ticker: "BTC", name: "BTC", cat: "Crypto", current: 100 }];
    const quotesData = { quotes: { BTC: { price: 50000, currency: "USD", dayChangePct: 10 } } };
    const model = buildLiveModel({ assets, quotesData, fxData, currency: "EUR" });
    expect(model.rows[0].liveValue).toBeCloseTo(110, 5);
    expect(model.rows[0].holdingsComputed).toBe(false);
  });

  it("computes Total Return from cost basis, not from a fixed baseline snapshot", () => {
    const assets = [{ ticker: "BTC", name: "BTC", cat: "Crypto", current: 150, costBasis: 100 }];
    const quotesData = { quotes: {} };
    const model = buildLiveModel({ assets, quotesData, fxData, currency: "EUR" });
    expect(model.totalReturn).toBe(50);
    expect(model.totalReturnPct).toBe(50);
  });
});
