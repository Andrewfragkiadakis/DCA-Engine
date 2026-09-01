import { describe, it, expect } from "vitest";
import {
  sanitizeNum, sanitizeStr, sanitizeDcaSchedule,
  activeDcaFromSchedule, nextDcaFromSchedule, addMonths,
  enrich, allocate, runProjection, freeCash, dcaFromIncome,
  buildMonthlySeries, monthlyContributions, historyEntryPoint,
  irr, seriesIrr, benchmarkSeries, ymOf,
  savingsPlanSplit, savingsPlanDrift,
  dividendIncome, US_WITHHOLDING_PCT,
  reviewStatus, sanitizeHistory, sanitizeHistoryEntry,
} from "./engine";

describe("dcaFromIncome", () => {
  it("takes a percentage of net income, rounded to whole euros", () => {
    expect(dcaFromIncome(2600, 10)).toBe(260);
    expect(dcaFromIncome(2600, 15)).toBe(390);
    expect(dcaFromIncome(1300, 10)).toBe(130);
  });
  it("rounds rather than truncating", () => {
    expect(dcaFromIncome(2555, 10)).toBe(256);
  });
  it("returns zero when income or percentage is missing", () => {
    expect(dcaFromIncome(0, 10)).toBe(0);
    expect(dcaFromIncome(2600, 0)).toBe(0);
    expect(dcaFromIncome(undefined, 10)).toBe(0);
  });
  it("clamps a nonsense percentage instead of exploding", () => {
    expect(dcaFromIncome(2600, 500)).toBe(2600);
    expect(dcaFromIncome(2600, -5)).toBe(0);
  });
});

describe("freeCash", () => {
  it("subtracts committed orders and buffer from available", () => {
    expect(freeCash({ available: 523.3, committed: 130, buffer: 0 })).toBeCloseTo(393.3, 5);
    expect(freeCash({ available: 523.3, committed: 130, buffer: 200 })).toBeCloseTo(193.3, 5);
  });
  it("never goes negative", () => {
    expect(freeCash({ available: 100, committed: 200, buffer: 50 })).toBe(0);
  });
  it("treats missing/garbage input as zero", () => {
    expect(freeCash(undefined)).toBe(0);
    expect(freeCash({ available: "abc" })).toBe(0);
  });
});

describe("sanitizeNum", () => {
  it("clamps within range", () => {
    expect(sanitizeNum(50, 0, 10, 0)).toBe(10);
    expect(sanitizeNum(-5, 0, 10, 0)).toBe(0);
    expect(sanitizeNum(5, 0, 10, 0)).toBe(5);
  });
  it("falls back on non-numeric input", () => {
    expect(sanitizeNum("abc", 0, 10, 3)).toBe(3);
    expect(sanitizeNum(undefined, 0, 10, 3)).toBe(3);
    expect(sanitizeNum(Infinity, 0, 10, 3)).toBe(3);
  });
});

describe("sanitizeStr", () => {
  it("strips dangerous characters and trims", () => {
    expect(sanitizeStr('  <script>"hi"</script>  ', 40)).toBe("scripthi/script");
  });
  it("truncates to maxLen", () => {
    expect(sanitizeStr("abcdefgh", 4)).toBe("abcd");
  });
  it("returns empty string for non-strings", () => {
    expect(sanitizeStr(42)).toBe("");
  });
});

describe("sanitizeDcaSchedule", () => {
  it("drops entries without a valid effectiveFrom", () => {
    const out = sanitizeDcaSchedule([{ amount: 100, effectiveFrom: "not-a-date" }]);
    expect(out).toEqual([]);
  });
  it("sorts by effectiveFrom ascending", () => {
    const out = sanitizeDcaSchedule([
      { amount: 200, effectiveFrom: "2027-01" },
      { amount: 100, effectiveFrom: "2026-06" },
    ]);
    expect(out.map(x => x.effectiveFrom)).toEqual(["2026-06", "2027-01"]);
  });
  it("caps amount and list length", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ amount: 999999999, effectiveFrom: `2026-${String((i % 12) + 1).padStart(2, "0")}` }));
    const out = sanitizeDcaSchedule(many);
    expect(out.length).toBeLessThanOrEqual(24);
    expect(out[0].amount).toBeLessThanOrEqual(1_000_000);
  });
});

describe("activeDcaFromSchedule / nextDcaFromSchedule", () => {
  const schedule = sanitizeDcaSchedule([
    { amount: 1300, effectiveFrom: "2025-01" },
    { amount: 2600, effectiveFrom: "2026-08" },
  ]);

  it("uses the base amount before any entry applies", () => {
    expect(activeDcaFromSchedule(schedule, 500, "2024-12")).toBe(500);
  });
  it("picks the latest entry at or before the given month", () => {
    expect(activeDcaFromSchedule(schedule, 500, "2026-01")).toBe(1300);
    expect(activeDcaFromSchedule(schedule, 500, "2026-08")).toBe(2600);
    expect(activeDcaFromSchedule(schedule, 500, "2027-01")).toBe(2600);
  });
  it("finds the next future entry", () => {
    expect(nextDcaFromSchedule(schedule, "2026-01")?.amount).toBe(2600);
    expect(nextDcaFromSchedule(schedule, "2026-08")).toBeNull();
  });
});

describe("addMonths", () => {
  it("adds months within the same year", () => {
    expect(addMonths("2026-01", 3)).toBe("2026-04");
  });
  it("rolls over into the next year", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
  });
  it("handles negative offsets", () => {
    expect(addMonths("2026-02", -3)).toBe("2025-11");
  });
});

describe("enrich", () => {
  it("computes pct, drift and gap relative to total", () => {
    const [row] = enrich([{ ticker: "BTC", current: 50, target: 25 }], 200);
    expect(row.pct).toBe(25);
    expect(row.drift).toBe(0);
    expect(row.gap).toBe(0);
  });
  it("returns zero pct when total is zero (no divide-by-zero NaN)", () => {
    const [row] = enrich([{ ticker: "BTC", current: 0, target: 50 }], 0);
    expect(row.pct).toBe(0);
    expect(Number.isFinite(row.gap)).toBe(true);
  });
  it("computes since-buy return from cost basis", () => {
    const [row] = enrich([{ ticker: "NVDA", current: 150, costBasis: 100, target: 5 }], 150);
    expect(row.sinceBuyPct).toBeCloseTo(50, 5);
    expect(row.sinceBuyAbs).toBeCloseTo(50, 5);
  });
  it("reports a loss as a negative since-buy return", () => {
    const [row] = enrich([{ ticker: "BTC", current: 90, costBasis: 100, target: 7 }], 90);
    expect(row.sinceBuyPct).toBeCloseTo(-10, 5);
    expect(row.sinceBuyAbs).toBeCloseTo(-10, 5);
  });
  it("leaves since-buy null when there is no cost basis", () => {
    const [row] = enrich([{ ticker: "X", current: 100, target: 10 }], 100);
    expect(row.sinceBuyPct).toBeNull();
    expect(row.sinceBuyAbs).toBeNull();
  });
});

describe("allocate (gap-weighted DCA)", () => {
  const portfolio = [
    { ticker: "A", current: 0,  target: 50 },
    { ticker: "B", current: 100, target: 50 },
  ];

  it("buys the most under-weight asset first", () => {
    const buys = allocate(portfolio, 100, 100);
    const a = buys.find(b => b.ticker === "A");
    expect(a).toBeTruthy();
    expect(a.buy).toBeGreaterThan(0);
  });
  it("spends the full budget", () => {
    const buys = allocate(portfolio, 100, 100);
    const spent = buys.reduce((s, b) => s + b.buy, 0);
    expect(spent).toBe(100);
  });
  it("returns nothing for a zero or negative budget", () => {
    expect(allocate(portfolio, 100, 0)).toEqual([]);
    expect(allocate(portfolio, 100, -50)).toEqual([]);
  });
  it("splits evenly when no asset is under target", () => {
    const balanced = [
      { ticker: "A", current: 50, target: 50 },
      { ticker: "B", current: 50, target: 50 },
    ];
    const buys = allocate(balanced, 100, 100);
    const spent = buys.reduce((s, b) => s + b.buy, 0);
    expect(spent).toBe(100);
  });
  it("splits by target weight (not evenly) when nothing is under target", () => {
    const balanced = [
      { ticker: "BIG",   current: 80, target: 80 },
      { ticker: "SMALL", current: 20, target: 20 },
    ];
    const buys = allocate(balanced, 100, 100);
    expect(buys.find(b => b.ticker === "BIG").buy).toBe(80);
    expect(buys.find(b => b.ticker === "SMALL").buy).toBe(20);
  });
});

describe("allocate with a lump sum larger than every gap", () => {
  // Nearly balanced portfolio: total gap is tiny relative to the deposit.
  const port = [
    { ticker: "A", current: 340, target: 33.34 },
    { ticker: "B", current: 330, target: 33.33 },
    { ticker: "C", current: 330, target: 33.33 },
  ];
  const total = 1000;

  it("spends the whole budget", () => {
    const buys = allocate(port, total, 500);
    expect(buys.reduce((s, b) => s + b.buy, 0)).toBe(500);
  });

  it("does not overshoot — a big deposit leaves drift no worse than before", () => {
    const before = Math.max(...enrich(port, total).map(a => Math.abs(a.drift)));
    const buys = allocate(port, total, 500);
    const after = port.map(a => {
      const b = buys.find(x => x.ticker === a.ticker);
      return b ? { ...a, current: a.current + b.buy } : { ...a };
    });
    const afterTotal = after.reduce((s, a) => s + a.current, 0);
    const maxAfter = Math.max(...enrich(after, afterTotal).map(a => Math.abs(a.drift)));
    expect(maxAfter).toBeLessThanOrEqual(before + 0.01);
  });

  it("still gap-weights when the budget is smaller than the total gap", () => {
    const skewed = [
      { ticker: "LOW",  current: 0,   target: 50 },
      { ticker: "HIGH", current: 100, target: 50 },
    ];
    const buys = allocate(skewed, 100, 20);
    expect(buys).toHaveLength(1);
    expect(buys[0].ticker).toBe("LOW");
    expect(buys[0].buy).toBe(20);
  });
});

describe("runProjection", () => {
  it("accumulates total by dca × months", () => {
    const assets = [
      { ticker: "A", current: 50, target: 50 },
      { ticker: "B", current: 50, target: 50 },
    ];
    const { finalTotal, steps } = runProjection(assets, 100, 20, 6);
    expect(finalTotal).toBe(100 + 20 * 6);
    expect(steps).toHaveLength(6);
  });
  it("keeps the portfolio converging toward target drift over time", () => {
    const assets = [
      { ticker: "A", current: 0,   target: 50 },
      { ticker: "B", current: 100, target: 50 },
    ];
    const { finalPort } = runProjection(assets, 100, 50, 12);
    const maxDrift = Math.max(...finalPort.map(a => Math.abs(a.drift)));
    expect(maxDrift).toBeLessThan(5);
  });
});

describe("buildMonthlySeries", () => {
  const history = [
    { label: "Jun 2026", completedAt: "2026-06-30", assets: [
      { ticker: "BTC", cat: "Crypto", current: 100, costBasis: 90 },
      { ticker: "CSPX", cat: "ETF", current: 400, costBasis: 380 },
    ]},
    { label: "Jul 2026", completedAt: "2026-07-31", assets: [
      { ticker: "BTC", cat: "Crypto", current: 130, costBasis: 120 },
      { ticker: "CSPX", cat: "ETF", current: 460, costBasis: 440 },
    ]},
  ];
  const current = [
    { ticker: "BTC", cat: "Crypto", current: 150, costBasis: 140 },
    { ticker: "CSPX", cat: "ETF", current: 500, costBasis: 470 },
  ];

  it("emits one point per snapshot plus the live portfolio", () => {
    expect(buildMonthlySeries(history, current).map(p => p.label)).toEqual(["Jun 2026", "Jul 2026", "Now"]);
  });
  it("sums value, invested and P&L across the snapshot", () => {
    const [first] = buildMonthlySeries(history, current);
    expect(first.value).toBe(500);
    expect(first.invested).toBe(470);
    expect(first.pnl).toBe(30);
  });
  it("narrows to the crypto bucket", () => {
    const s = buildMonthlySeries(history, current, "crypto");
    expect(s.map(p => p.value)).toEqual([100, 130, 150]);
    expect(s.map(p => p.invested)).toEqual([90, 120, 140]);
  });
  it("narrows to everything except crypto", () => {
    expect(buildMonthlySeries(history, current, "rest").map(p => p.value)).toEqual([400, 460, 500]);
  });
  it("falls back to value when a snapshot predates cost basis (zero P&L, not a fake one)", () => {
    const legacy = [{ label: "Old", completedAt: "2026-01-31", assets: [{ ticker: "BTC", cat: "Crypto", current: 200 }] }];
    const [p] = buildMonthlySeries(legacy, []);
    expect(p.invested).toBe(200);
    expect(p.pnl).toBe(0);
  });
  it("survives missing history and missing assets", () => {
    expect(buildMonthlySeries(undefined, undefined)).toEqual([]);
    expect(buildMonthlySeries(null, [])).toEqual([]);
  });
});

describe("backfilled history entries", () => {
  const entry = {
    label: "Mar 2026", completedAt: "2026-03-31", backfilled: true, contributed: 260,
    totals: { value: 1000, invested: 950, cryptoValue: 180, cryptoInvested: 170 },
  };

  it("reads portfolio totals without inventing per-asset rows", () => {
    const p = historyEntryPoint(entry);
    expect(p).toMatchObject({ value: 1000, invested: 950, pnl: 50, backfilled: true });
  });
  it("splits into buckets from the recorded crypto figures", () => {
    expect(historyEntryPoint(entry, "crypto")).toMatchObject({ value: 180, invested: 170 });
    expect(historyEntryPoint(entry, "rest")).toMatchObject({ value: 820, invested: 780 });
  });
  it("returns null for a bucket when no split was recorded, rather than guessing", () => {
    const noSplit = { ...entry, totals: { value: 1000, invested: 950 } };
    expect(historyEntryPoint(noSplit, "all")).toMatchObject({ value: 1000 });
    expect(historyEntryPoint(noSplit, "crypto")).toBeNull();
    expect(historyEntryPoint(noSplit, "rest")).toBeNull();
  });
  it("assumes crypto invested equals crypto value when only the value is known", () => {
    const partial = { ...entry, totals: { value: 1000, invested: 950, cryptoValue: 180 } };
    expect(historyEntryPoint(partial, "crypto")).toMatchObject({ value: 180, invested: 180, pnl: 0 });
  });
  it("mixes with real snapshots in one series", () => {
    const mixed = [entry, { label: "Apr", completedAt: "2026-04-30", assets: [{ ticker: "BTC", cat: "Crypto", current: 200, costBasis: 190 }] }];
    expect(buildMonthlySeries(mixed, []).map(p => p.value)).toEqual([1000, 200]);
  });
});

describe("monthlyContributions", () => {
  const history = [
    { label: "Jun 2026", completedAt: "2026-06-30", buys: [
      { ticker: "BTC", cat: "Crypto", buy: 30 },
      { ticker: "CSPX", cat: "ETF", buy: 100 },
    ]},
    { label: "Jul 2026", completedAt: "2026-07-31", buys: [{ ticker: "CSPX", cat: "ETF", buy: 260 }] },
  ];

  it("totals what each locked-in month bought", () => {
    expect(monthlyContributions(history).map(c => c.amount)).toEqual([130, 260]);
  });
  it("splits by bucket", () => {
    expect(monthlyContributions(history, "crypto").map(c => c.amount)).toEqual([30, 0]);
  });
  it("reports zero for a month with no buys recorded", () => {
    expect(monthlyContributions([{ label: "Aug 2026" }])[0].amount).toBe(0);
  });
  it("uses the entered figure for a backfilled month, and null for a bucket it cannot split", () => {
    const back = [{ label: "Mar", completedAt: "2026-03-31", backfilled: true, contributed: 260, totals: { value: 1, invested: 1 } }];
    expect(monthlyContributions(back)[0].amount).toBe(260);
    expect(monthlyContributions(back, "crypto")[0].amount).toBeNull();
  });
  it("survives missing history", () => {
    expect(monthlyContributions(undefined)).toEqual([]);
  });
});

describe("irr", () => {
  it("solves a single-period doubling as 100%", () => {
    // 365 calendar days against a 365.2425-day year, so the exact answer is a shade over 1.
    const r = irr([{ date: "2025-01-01", amount: -100 }, { date: "2026-01-01", amount: 200 }]);
    expect(r).toBeCloseTo(1, 2);
  });
  it("returns zero for money that did not grow", () => {
    const r = irr([{ date: "2025-01-01", amount: -100 }, { date: "2026-01-01", amount: 100 }]);
    expect(r).toBeCloseTo(0, 5);
  });
  it("handles a loss", () => {
    const r = irr([{ date: "2025-01-01", amount: -100 }, { date: "2026-01-01", amount: 90 }]);
    expect(r).toBeCloseTo(-0.1, 3);
  });
  it("annualises a sub-year holding period upward", () => {
    const r = irr([{ date: "2026-01-01", amount: -100 }, { date: "2026-07-01", amount: 110 }]);
    expect(r).toBeGreaterThan(0.19); // ~21% annualised, not 10%
  });
  it("weights later contributions less than early ones", () => {
    // Same total in, same value out — but money that arrived late worked for less time,
    // so the implied rate must be higher.
    const early = irr([{ date: "2026-01-01", amount: -200 }, { date: "2027-01-01", amount: 220 }]);
    const late = irr([
      { date: "2026-01-01", amount: -100 },
      { date: "2026-12-01", amount: -100 },
      { date: "2027-01-01", amount: 220 },
    ]);
    expect(late).toBeGreaterThan(early);
  });
  it("returns null when there is nothing to solve", () => {
    expect(irr([])).toBeNull();
    expect(irr([{ date: "2026-01-01", amount: -100 }])).toBeNull();
    expect(irr([{ date: "2026-01-01", amount: -100 }, { date: "2026-06-01", amount: -50 }])).toBeNull();
  });
  it("ignores malformed flows instead of returning NaN", () => {
    const r = irr([
      { date: "bogus", amount: -50 },
      { amount: -50 },
      { date: "2025-01-01", amount: -100 },
      { date: "2026-01-01", amount: 200 },
    ]);
    expect(r).toBeCloseTo(1, 2);
  });
});

describe("seriesIrr", () => {
  it("derives contributions from the rise in invested", () => {
    const series = [
      { date: "2025-01-01", value: 100, invested: 100 },
      { date: "2026-01-01", value: 220, invested: 200 },
    ];
    // 100 in at t0, 100 more at t1, worth 220 at t1.
    const r = seriesIrr(series);
    expect(r).toBeCloseTo(0.2, 2);
  });
  it("reports a negative return when value trails money in", () => {
    const r = seriesIrr([
      { date: "2025-01-01", value: 100, invested: 100 },
      { date: "2026-01-01", value: 150, invested: 200 },
    ]);
    expect(r).toBeLessThan(0);
  });
  it("returns null for fewer than two points", () => {
    expect(seriesIrr([{ date: "2026-01-01", value: 1, invested: 1 }])).toBeNull();
    expect(seriesIrr([])).toBeNull();
  });
});

describe("benchmarkSeries", () => {
  const series = [
    { date: "2026-01-31", value: 100, invested: 100 },
    { date: "2026-02-28", value: 210, invested: 200 },
    { date: "2026-03-31", value: 320, invested: 300 },
  ];

  it("buys benchmark units with each contribution at that month's price", () => {
    const { points, complete } = benchmarkSeries(series, { "2026-01": 10, "2026-02": 20, "2026-03": 25 });
    expect(complete).toBe(true);
    expect(points[0].benchmark).toBeCloseTo(100, 6);   // 10 units at 10
    expect(points[1].benchmark).toBeCloseTo(300, 6);   // 10 units at 20 + 5 units at 20
    expect(points[2].benchmark).toBeCloseTo(475, 6);   // 19 units at 25
  });
  it("counts a missing month instead of interpolating a price", () => {
    const { points, missing, complete } = benchmarkSeries(series, { "2026-01": 10, "2026-03": 25 });
    expect(missing).toBe(1);
    expect(complete).toBe(false);
    expect(points[1].benchmark).toBeCloseTo(100, 6); // marked at the last known price, no units bought
  });
  it("returns null without a usable series or price map", () => {
    expect(benchmarkSeries(series, null)).toBeNull();
    expect(benchmarkSeries([series[0]], { "2026-01": 10 })).toBeNull();
  });
  it("ymOf formats and rejects", () => {
    expect(ymOf("2026-03-31")).toBe("2026-03");
    expect(ymOf("nope")).toBeNull();
  });
});

describe("savingsPlanSplit / savingsPlanDrift", () => {
  const portfolio = [
    { ticker: "A", name: "A", cat: "ETF", current: 0, target: 50 },
    { ticker: "B", name: "B", cat: "ETF", current: 100, target: 50 },
  ];

  it("spends the monthly amount exactly in whole euros", () => {
    const plan = savingsPlanSplit(portfolio, 100, 260);
    expect(plan.reduce((s, r) => s + r.amount, 0)).toBe(260);
    expect(plan.every(r => Number.isInteger(r.amount))).toBe(true);
  });
  it("drops rows below one euro — a savings plan cannot hold cents", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ ticker: `T${i}`, current: 10, target: 2.5 }));
    const plan = savingsPlanSplit(many, 400, 20);
    expect(plan.every(r => r.amount >= 1)).toBe(true);
  });
  it("reports zero drift against a freshly generated plan", () => {
    const plan = savingsPlanSplit(portfolio, 100, 260);
    expect(savingsPlanDrift(plan, portfolio, 100, 260)).toBeCloseTo(0, 6);
  });
  it("reports drift once the portfolio has moved on", () => {
    const plan = savingsPlanSplit(portfolio, 100, 260);
    const moved = [{ ...portfolio[0], current: 400 }, { ...portfolio[1], current: 100 }];
    expect(savingsPlanDrift(plan, moved, 500, 260)).toBeGreaterThan(20);
  });
  it("returns null with no stored plan", () => {
    expect(savingsPlanDrift([], portfolio, 100, 260)).toBeNull();
    expect(savingsPlanDrift(null, portfolio, 100, 260)).toBeNull();
  });
});

describe("dividendIncome", () => {
  const assets = [
    { ticker: "KO", cat: "Dividend", current: 1000, yieldPct: 3, ucits: false },
    { ticker: "VHYL", cat: "ETF", current: 1000, yieldPct: 3, ucits: true },
    { ticker: "BTC", cat: "Crypto", current: 500 },
  ];

  it("keeps the whole gross on a UCITS row and withholds on a US share", () => {
    const { rows, gross, withheld, net } = dividendIncome(assets);
    expect(gross).toBeCloseTo(60, 6);
    expect(withheld).toBeCloseTo(30 * US_WITHHOLDING_PCT / 100, 6);
    expect(net).toBeCloseTo(60 - 4.5, 6);
    expect(rows.find(r => r.ticker === "VHYL").withheld).toBe(0);
  });
  it("ignores assets with no yield entered", () => {
    expect(dividendIncome(assets).coveredCount).toBe(2);
  });
  it("expresses income as a yield on the whole portfolio, dilution included", () => {
    expect(dividendIncome(assets).yieldOnPortfolioPct).toBeCloseTo((60 / 2500) * 100, 6);
  });
  it("returns zeroes rather than NaN for an empty portfolio", () => {
    const d = dividendIncome([]);
    expect(d.gross).toBe(0);
    expect(d.yieldOnPortfolioPct).toBe(0);
  });
});

describe("reviewStatus", () => {
  const now = new Date("2026-09-01T12:00:00Z");
  it("is unset before the first review", () => {
    expect(reviewStatus(null, 3, now).state).toBe("unset");
  });
  it("is ok well before the due date", () => {
    expect(reviewStatus("2026-08-01T00:00:00Z", 3, now).state).toBe("ok");
  });
  it("warns inside the last two weeks", () => {
    expect(reviewStatus("2026-06-10T00:00:00Z", 3, now).state).toBe("soon");
  });
  it("is overdue past the interval", () => {
    const r = reviewStatus("2026-01-01T00:00:00Z", 3, now);
    expect(r.state).toBe("overdue");
    expect(r.days).toBeLessThan(0);
  });
  it("honours a custom interval", () => {
    expect(reviewStatus("2026-08-01T00:00:00Z", 1, now).state).toBe("overdue");
  });
});

describe("sanitizeHistory", () => {
  it("drops entries with no usable date", () => {
    expect(sanitizeHistoryEntry({ assets: [{ ticker: "A", current: 1 }] })).toBeNull();
    expect(sanitizeHistoryEntry({ completedAt: "nonsense", assets: [{ ticker: "A", current: 1 }] })).toBeNull();
  });
  it("drops a snapshot whose assets are all unusable", () => {
    expect(sanitizeHistoryEntry({ completedAt: "2026-01-31", assets: [{ ticker: "A", current: "abc" }] })).toBeNull();
  });
  it("rejects backfilled totals that are not finite numbers", () => {
    expect(sanitizeHistoryEntry({ completedAt: "2026-01-31", totals: { value: "x", invested: 1 } })).toBeNull();
    expect(sanitizeHistoryEntry({ completedAt: "2026-01-31", totals: { value: -5, invested: 1 } })).toBeNull();
  });
  it("ignores a crypto value larger than the portfolio value", () => {
    const e = sanitizeHistoryEntry({ completedAt: "2026-01-31", totals: { value: 100, invested: 100, cryptoValue: 500 } });
    expect(e.totals.cryptoValue).toBeUndefined();
  });
  it("preserves unknown per-asset fields", () => {
    const e = sanitizeHistoryEntry({ completedAt: "2026-01-31", assets: [{ ticker: "A", current: 5, icon: "apple", holdings: 2 }] });
    expect(e.assets[0]).toMatchObject({ icon: "apple", holdings: 2 });
  });
  it("sorts oldest first so a late-added backfill lands in the right place", () => {
    const out = sanitizeHistory([
      { completedAt: "2026-06-30", assets: [{ ticker: "A", current: 3 }] },
      { completedAt: "2026-02-28", totals: { value: 1, invested: 1 } },
    ]);
    expect(out.map(e => e.completedAt)).toEqual(["2026-02-28", "2026-06-30"]);
  });
  it("returns an empty list for garbage", () => {
    expect(sanitizeHistory(null)).toEqual([]);
    expect(sanitizeHistory([null, 5, "x"])).toEqual([]);
  });
});
