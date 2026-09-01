# Instrument availability (PRIIPs) and look-through exposure

**Date:** 2026-09-01
**Status:** `verified` for the regulatory point; index weights are approximate
and move over time.

---

## 1. US-domiciled ETFs are not buyable from the EU

The written plan originally named **SPY, VOO and VT**. None are purchasable by an
EU retail investor: under **PRIIPs**, a fund sold to EU retail clients must
publish a KID, and US-domiciled funds do not.

The Irish UCITS equivalents actually held are the correct substitution:

| Plan named | Held instead | Domicile |
|---|---|---|
| SPY / VOO (S&P 500) | CSPX | Ireland |
| VT (global) | VWCE | Ireland |
| — (dividend) | VHYL | Ireland |

This is worth keeping written down so the plan is not later "corrected" back to
the US tickers. It also has a tax consequence in the portfolio's favour — see the
Greek tax entry, section 1.

## 2. Look-through exposure is higher than the plan's line items imply

The plan's sleeve percentages describe direct holdings only. Adding the ETF
pass-through changes the real picture materially:

- The three directly-held mega-cap tech names are also held inside both broad
  ETFs, so each one's true weight is roughly 1.5–2 percentage points above its
  direct weight.
- Stated tech sleeve ~20%; **effective ~25%**.
- Stated "S&P + global" ~32.5% implies moderate US exposure; **effective US
  exposure is ~64%** (CSPX is 100% US, VWCE is ~62% US, and all directly-held
  single stocks are US).

Neither is necessarily wrong for a growth mandate over a 10-year horizon. The
point is that it should be a decision rather than an accident, and that the
plan's sleeve percentages understate concentration.

**Not yet reflected in the app:** the app measures direct weights only. A
look-through view is a candidate feature, and would need index constituent
weights from a data source it does not currently have.
