import { describe, it, expect } from "vitest";
import {
  sanitizeNum, sanitizeStr, sanitizeDcaSchedule,
  activeDcaFromSchedule, nextDcaFromSchedule, addMonths,
  enrich, allocate, runProjection,
} from "./engine";

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
