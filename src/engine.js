// ─── Pure calculation engine — no React, no DOM, fully unit-testable ──────────

export function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

export function sanitizeNum(v, lo, hi, fallback) {
  const n = parseFloat(v);
  return isNaN(n) || !isFinite(n) ? fallback : clamp(n, lo, hi);
}

export function sanitizeStr(v, maxLen = 32) {
  if (typeof v !== "string") return "";
  return v.replace(/[<>"'`]/g, "").trim().slice(0, maxLen);
}

export function sanitizeDcaSchedule(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(item => {
      if (!item || typeof item !== "object") return null;
      const amount = sanitizeNum(item.amount, 0, 1_000_000, 0);
      const effectiveFrom = typeof item.effectiveFrom === "string" && /^\d{4}-\d{2}$/.test(item.effectiveFrom) ? item.effectiveFrom : null;
      if (!effectiveFrom) return null;
      return {
        id: typeof item.id === "string" ? item.id.slice(0, 32) : `sch-${Math.random().toString(36).slice(2, 9)}`,
        effectiveFrom,
        amount,
        note: typeof item.note === "string" ? item.note.slice(0, 80) : "",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .slice(0, 24);
}

export function currentMonthYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function activeDcaFromSchedule(schedule, baseDca, ym = currentMonthYM()) {
  if (!Array.isArray(schedule) || !schedule.length) return baseDca;
  const past = schedule.filter(s => s.effectiveFrom <= ym).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return past[0] ? past[0].amount : baseDca;
}

export function nextDcaFromSchedule(schedule, ym = currentMonthYM()) {
  if (!Array.isArray(schedule) || !schedule.length) return null;
  return schedule.find(s => s.effectiveFrom > ym) || null;
}

export function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

// Cash you can actually deploy right now: the broker's available balance, minus orders
// already queued (savings plans due to execute), minus a buffer you keep untouched.
export function freeCash(cash) {
  const available = sanitizeNum(cash?.available, 0, 10_000_000, 0);
  const committed = sanitizeNum(cash?.committed, 0, 10_000_000, 0);
  const buffer    = sanitizeNum(cash?.buffer, 0, 10_000_000, 0);
  return Math.max(0, available - committed - buffer);
}

export function enrich(list, total) {
  return list.map(a => {
    const pct   = total > 0 ? (a.current / total) * 100 : 0;
    const drift = pct - a.target;
    const gap   = (a.target / 100) * total - a.current;
    // Return since purchase, the same figure Trade Republic shows per position.
    // Null (not zero) when there's no cost basis to compare against, so the UI can
    // distinguish "flat" from "unknown".
    const basis = a.costBasis;
    const sinceBuyPct = basis != null && basis > 0 ? ((a.current - basis) / basis) * 100 : null;
    const sinceBuyAbs = basis != null && basis > 0 ? a.current - basis : null;
    return { ...a, pct, drift, gap, sinceBuyPct, sinceBuyAbs };
  });
}

// Split a budget across holdings in proportion to their target weight. Used when there
// are no gaps left to close, so the money lands without skewing the allocation.
// Always spends the budget exactly (whole euros).
function splitByTarget(items, budget) {
  if (budget <= 0 || !items.length) return [];
  const targetSum = items.reduce((s, i) => s + i.target, 0);
  const weights = targetSum > 0
    ? items.map(i => i.target / targetSum)
    : items.map(() => 1 / items.length);

  const out = items.map((i, idx) => ({ ...i, buy: Math.floor(weights[idx] * budget) }));
  let rem = budget - out.reduce((s, o) => s + o.buy, 0);
  // Hand the rounding remainder to the largest weights, one euro at a time.
  const order = out.map((_, idx) => idx).sort((a, b) => weights[b] - weights[a]);
  for (let k = 0; rem > 0; k = (k + 1) % order.length) { out[order[k]].buy += 1; rem -= 1; }
  return out.filter(o => o.buy > 0);
}

export function allocate(portfolio, total, budget) {
  if (budget <= 0) return [];
  const items     = enrich(portfolio, total);
  const under     = items.filter(i => i.gap > 0).sort((a, b) => b.gap - a.gap);
  const totalGap  = under.reduce((s, i) => s + i.gap, 0);

  // Everything already at or above target — top up by target weight.
  if (totalGap <= 0 || under.length === 0) return splitByTarget(items, budget);

  // Budget can't close every gap: weight by gap size. This is the normal monthly case.
  if (budget <= totalGap) {
    let rem = budget;
    const buys = [];
    for (const item of under) {
      let alloc = Math.round((item.gap / totalGap) * budget);
      alloc = Math.min(alloc, rem);
      if (alloc > 0) { buys.push({ ...item, buy: alloc }); rem -= alloc; }
    }
    if (rem > 0 && buys.length > 0) buys[0].buy += rem;
    return buys;
  }

  // Budget exceeds every gap (a big lump sum). Close each gap exactly, then spread the
  // surplus by target weight. Distributing the surplus gap-proportionally instead would
  // overshoot whichever holding happened to be furthest behind and leave the portfolio
  // more skewed than before the deposit.
  const buys = under.map(i => ({ ...i, buy: Math.floor(i.gap) }));
  const surplus = budget - buys.reduce((s, b) => s + b.buy, 0);
  for (const extra of splitByTarget(items, surplus)) {
    const hit = buys.find(b => b.ticker === extra.ticker);
    if (hit) hit.buy += extra.buy;
    else buys.push(extra);
  }
  return buys.filter(b => b.buy > 0).sort((a, b) => b.buy - a.buy);
}

export function runProjection(assets, total, dca, months) {
  const steps = [];
  let port = assets.map(a => ({ ...a }));
  let tot  = total;
  for (let m = 0; m < months; m++) {
    const buys = allocate(port, tot, dca);
    steps.push({ month: m + 1, buys, total: tot, port: port.map(a => ({ ...a })) });
    port = port.map(a => {
      const b = buys.find(x => x.ticker === a.ticker);
      return b ? { ...a, current: Math.round((a.current + b.buy) * 100) / 100 } : { ...a };
    });
    tot = Math.round((tot + dca) * 100) / 100;
  }
  return { steps, finalPort: enrich(port, tot), finalTotal: tot };
}
