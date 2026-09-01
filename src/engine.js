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

// DCA derived from income (e.g. "10% of net income"). Whole euros — savings plans are
// set in round amounts, and a cent-precise figure would be false precision.
export function dcaFromIncome(monthlyNet, pctOfIncome) {
  const income = sanitizeNum(monthlyNet, 0, 1_000_000, 0);
  const pct = sanitizeNum(pctOfIncome, 0, 100, 0);
  if (income <= 0 || pct <= 0) return 0;
  return Math.round((income * pct) / 100);
}

// ─── History shapes ──────────────────────────────────────────────────────────
// A history entry is one of two shapes:
//   • a locked-in snapshot — `assets: [...]` with per-asset current/costBasis
//   • a backfilled month   — `totals: { value, invested, cryptoValue?, cryptoInvested? }`
// Backfilled months deliberately carry no per-asset rows: reconstructing them from a
// statement would mean inventing numbers. Anything that can't be answered from the
// recorded totals returns null rather than a guess.

export const BUCKETS = ["all", "crypto", "rest"];

const inBucket = (bucket, cat) =>
  bucket === "all" ? true : bucket === "crypto" ? cat === "Crypto" : cat !== "Crypto";

function pointFromAssets(assets, bucket) {
  const rows = (assets || []).filter(a => inBucket(bucket, a.cat));
  if (!rows.length) return null;
  const value = rows.reduce((s, a) => s + (a.current || 0), 0);
  // Snapshots taken before cost basis existed fall back to their value, which honestly
  // reports zero P&L for that month rather than inventing a number.
  const invested = rows.reduce((s, a) => s + (a.costBasis != null ? a.costBasis : (a.current || 0)), 0);
  return { value, invested };
}

function pointFromTotals(t, bucket) {
  if (!t || !isFinite(t.value) || !isFinite(t.invested)) return null;
  if (bucket === "all") return { value: t.value, invested: t.invested };
  const cv = isFinite(t.cryptoValue) ? t.cryptoValue : null;
  if (cv == null) return null; // no split was recorded — don't manufacture one
  const ci = isFinite(t.cryptoInvested) ? t.cryptoInvested : cv;
  return bucket === "crypto"
    ? { value: cv, invested: ci }
    : { value: t.value - cv, invested: t.invested - ci };
}

export function historyEntryPoint(entry, bucket = "all") {
  if (!entry) return null;
  const core = entry.totals ? pointFromTotals(entry.totals, bucket) : pointFromAssets(entry.assets, bucket);
  if (!core) return null;
  return {
    label: entry.label || "",
    date: entry.completedAt || "",
    backfilled: !!entry.backfilled,
    ...core,
    pnl: core.value - core.invested,
  };
}

// Rolls history into a value-vs-invested series for the analytics charts, with the live
// portfolio appended as the final point.
export function buildMonthlySeries(history, currentAssets, bucket = "all") {
  const series = (history || [])
    .map(h => historyEntryPoint(h, bucket))
    .filter(Boolean);

  const now = pointFromAssets(currentAssets, bucket);
  if (now) {
    series.push({
      label: "Now", date: new Date().toISOString(), backfilled: false,
      ...now, pnl: now.value - now.invested,
    });
  }
  return series;
}

// Contribution per month. A locked-in month reports what it actually bought; a
// backfilled month reports the figure entered for it.
export function monthlyContributions(history, bucket = "all") {
  return (history || []).map(h => {
    let amount;
    if (h.totals) {
      // Only the portfolio-level figure is known for a backfilled month.
      amount = bucket === "all" && isFinite(h.contributed) ? h.contributed : null;
    } else {
      amount = (h.buys || [])
        .filter(b => inBucket(bucket, b.cat))
        .reduce((s, b) => s + (b.buy || 0), 0);
    }
    return { label: h.label || "", date: h.completedAt || "", amount, backfilled: !!h.backfilled };
  });
}

// ─── Money-weighted return ───────────────────────────────────────────────────
// Bisection on NPV rather than Newton. Newton diverges on the shape a DCA history
// produces (many closely spaced flows, a root near zero), and a return figure that
// occasionally comes back as NaN is worse than one that takes 200 cheap iterations.
const MS_PER_YEAR = 365.2425 * 24 * 3600 * 1000;

export function irr(flows, lo = -0.9999, hi = 10) {
  const rows = (flows || [])
    .filter(f => f && isFinite(f.amount) && f.amount !== 0 && f.date)
    .map(f => ({ amount: f.amount, t: new Date(f.date).getTime() }))
    .filter(f => !isNaN(f.t))
    .sort((a, b) => a.t - b.t);
  if (rows.length < 2) return null;
  if (!rows.some(r => r.amount < 0) || !rows.some(r => r.amount > 0)) return null;

  const t0 = rows[0].t;
  const npv = r => rows.reduce((s, x) => s + x.amount / Math.pow(1 + r, (x.t - t0) / MS_PER_YEAR), 0);

  let fLo = npv(lo);
  const fHi = npv(hi);
  if (!isFinite(fLo) || !isFinite(fHi) || fLo * fHi > 0) return null; // no root in the bracket
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const f = npv(mid);
    if (f === 0) return mid;
    if (fLo * f < 0) { hi = mid; } else { lo = mid; fLo = f; }
  }
  return (lo + hi) / 2;
}

// Annualised money-weighted return from a value/invested series. Each rise in invested
// is a contribution on that date; the final value is the closing flow. Derived from
// invested rather than from recorded buys so the first tracked month's existing cost
// basis counts as capital put in, instead of appearing as free money.
export function seriesIrr(series) {
  if (!series || series.length < 2) return null;
  const flows = [];
  let prev = 0;
  for (const p of series) {
    const delta = p.invested - prev;
    prev = p.invested;
    if (delta !== 0 && p.date) flows.push({ date: p.date, amount: -delta });
  }
  const last = series[series.length - 1];
  if (!last.date) return null;
  flows.push({ date: last.date, amount: last.value });
  return irr(flows);
}

// ─── Benchmark counterfactual ────────────────────────────────────────────────
export function ymOf(date) {
  const d = new Date(date);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// "What if every euro had gone into the benchmark instead." `closes` maps YYYY-MM to a
// month-end price. A month with no price cannot buy units — it is counted as missing and
// reported, never interpolated, because a silently interpolated price would make the
// comparison look authoritative when it isn't.
export function benchmarkSeries(series, closes) {
  if (!series || series.length < 2 || !closes) return null;
  let units = 0, prevInvested = 0, lastPx = null, missing = 0;
  const points = series.map(p => {
    const delta = p.invested - prevInvested;
    prevInvested = p.invested;
    const px = closes[ymOf(p.date)];
    const valid = isFinite(px) && px > 0;
    if (valid) lastPx = px;
    if (delta > 0 && !valid) missing++;
    if (delta > 0 && valid) units += delta / px;
    const mark = valid ? px : lastPx;
    return { ...p, benchmark: mark != null && units > 0 ? units * mark : null };
  });
  return { points, missing, complete: missing === 0 };
}

// ─── Savings plan ────────────────────────────────────────────────────────────
// A Trade Republic savings plan executes a fixed split every month; the allocator is
// gap-weighted and moves as the portfolio does. These two functions are the bridge:
// propose a fixed split from today's gaps, then measure how stale it has become.
export function savingsPlanSplit(portfolio, total, monthly) {
  const buys = allocate(portfolio, total, monthly);
  const rows = buys
    .map(b => ({ ticker: b.ticker, name: b.name, cat: b.cat, icon: b.icon, amount: Math.round(b.buy) }))
    .filter(r => r.amount >= 1)
    .sort((a, b) => b.amount - a.amount);
  // Rounding to whole euros can lose or gain a euro; give the difference to the largest.
  const spent = rows.reduce((s, r) => s + r.amount, 0);
  if (rows.length && spent !== Math.round(monthly)) rows[0].amount += Math.round(monthly) - spent;
  return rows.filter(r => r.amount >= 1);
}

// How far a stored plan has drifted from what the allocator would set up today, as a
// percentage of the monthly amount. Halved because every euro that should move shows up
// twice — once as a shortfall, once as an excess.
export function savingsPlanDrift(plan, portfolio, total, monthly) {
  if (!Array.isArray(plan) || !plan.length || monthly <= 0) return null;
  const fresh = savingsPlanSplit(portfolio, total, monthly);
  const amountOf = (rows, ticker) => (rows.find(r => r.ticker === ticker)?.amount || 0);
  const tickers = new Set([...plan.map(p => p.ticker), ...fresh.map(p => p.ticker)]);
  let diff = 0;
  for (const t of tickers) diff += Math.abs(amountOf(plan, t) - amountOf(fresh, t));
  return (diff / 2 / monthly) * 100;
}

// ─── Dividend income ────────────────────────────────────────────────────────
// US withholding is deducted at source on US-listed shares and is not recoverable.
// EU/EEA UCITS distributions are exempt for a Greek resident, so a UCITS row keeps the
// whole gross — see docs/research/2026-09-01-greece-tax-treatment.md.
export const US_WITHHOLDING_PCT = 15;

export function dividendIncome(assets, withholdingPct = US_WITHHOLDING_PCT) {
  const wh = sanitizeNum(withholdingPct, 0, 100, US_WITHHOLDING_PCT);
  const rows = (assets || [])
    .filter(a => a && isFinite(a.yieldPct) && a.yieldPct > 0 && (a.current || 0) > 0)
    .map(a => {
      const gross = ((a.current || 0) * a.yieldPct) / 100;
      const withheld = a.ucits ? 0 : (gross * wh) / 100;
      return {
        ticker: a.ticker, name: a.name, cat: a.cat, icon: a.icon,
        yieldPct: a.yieldPct, ucits: !!a.ucits,
        gross, withheld, net: gross - withheld,
      };
    })
    .sort((a, b) => b.gross - a.gross);

  const gross = rows.reduce((s, r) => s + r.gross, 0);
  const withheld = rows.reduce((s, r) => s + r.withheld, 0);
  const portfolioValue = (assets || []).reduce((s, a) => s + (a.current || 0), 0);
  return {
    rows, gross, withheld, net: gross - withheld,
    yieldOnPortfolioPct: portfolioValue > 0 ? (gross / portfolioValue) * 100 : 0,
    coveredCount: rows.length,
    payerCount: (assets || []).filter(a => a && isFinite(a.yieldPct) && a.yieldPct > 0).length,
  };
}

// ─── Review cadence ─────────────────────────────────────────────────────────
export function reviewStatus(lastReviewedAt, intervalMonths = 3, now = new Date()) {
  const months = sanitizeNum(intervalMonths, 1, 24, 3);
  const base = lastReviewedAt ? new Date(lastReviewedAt) : null;
  if (!base || isNaN(base)) return { state: "unset", due: null, days: null };
  const due = new Date(base);
  due.setMonth(due.getMonth() + months);
  // Whole days left; goes negative the moment the due date passes.
  const days = Math.floor((due.getTime() - now.getTime()) / 86_400_000);
  return { state: days < 0 ? "overdue" : days <= 14 ? "soon" : "ok", due, days };
}

// ─── History sanitation ─────────────────────────────────────────────────────
// History used to be trusted verbatim from an imported backup. Now that a backfilled
// month is a first-class shape, a malformed entry could produce NaN in a chart, so the
// import path validates it. Unknown per-asset fields are preserved — only the numbers
// the charts depend on are checked.
function finiteOrNull(v) {
  const n = parseFloat(v);
  return isNaN(n) || !isFinite(n) ? null : n;
}

export function sanitizeHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const completedAt = typeof entry.completedAt === "string" && !isNaN(new Date(entry.completedAt))
    ? entry.completedAt : null;
  if (!completedAt) return null;

  const base = {
    label: typeof entry.label === "string" ? entry.label.slice(0, 40) : "",
    completedAt,
    note: typeof entry.note === "string" ? entry.note.slice(0, 500) : "",
  };

  if (entry.totals && typeof entry.totals === "object") {
    const value = finiteOrNull(entry.totals.value);
    const invested = finiteOrNull(entry.totals.invested);
    if (value == null || invested == null || value < 0 || invested < 0) return null;
    const cryptoValue = finiteOrNull(entry.totals.cryptoValue);
    const cryptoInvested = finiteOrNull(entry.totals.cryptoInvested);
    return {
      ...base,
      backfilled: true,
      contributed: Math.max(0, finiteOrNull(entry.contributed) ?? 0),
      total: value,
      totals: {
        value, invested,
        ...(cryptoValue != null && cryptoValue >= 0 && cryptoValue <= value
          ? { cryptoValue, cryptoInvested: cryptoInvested != null && cryptoInvested >= 0 ? cryptoInvested : cryptoValue }
          : {}),
      },
    };
  }

  if (!Array.isArray(entry.assets) || !entry.assets.length) return null;
  const assets = entry.assets
    .filter(a => a && typeof a === "object" && typeof a.ticker === "string" && finiteOrNull(a.current) != null)
    .map(a => ({ ...a, current: finiteOrNull(a.current), costBasis: finiteOrNull(a.costBasis) }));
  if (!assets.length) return null;

  return {
    ...base,
    backfilled: false,
    assets,
    total: finiteOrNull(entry.total) ?? assets.reduce((s, a) => s + a.current, 0),
    buys: Array.isArray(entry.buys)
      ? entry.buys
          .filter(b => b && typeof b.ticker === "string" && finiteOrNull(b.buy) != null)
          .map(b => ({ ...b, buy: finiteOrNull(b.buy) }))
      : [],
  };
}

// Sorted oldest-first so the charts read left to right regardless of insertion order —
// a backfilled month is added after the months that follow it.
export function sanitizeHistory(arr, max = 240) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(sanitizeHistoryEntry)
    .filter(Boolean)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    .slice(-max);
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
