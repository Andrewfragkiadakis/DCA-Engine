import { describe, it, expect } from "vitest";
import {
  sanitizeNum, sanitizeStr, sanitizeDcaSchedule,
  activeDcaFromSchedule, nextDcaFromSchedule, addMonths,
  enrich, allocate, runProjection, freeCash,
} from "./engine";

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
