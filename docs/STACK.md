# Tech stack

Short, complete reference for everything this project runs on. Kept current —
update it in the same commit as any major change, and add a line to the
changelog at the bottom.

**Last updated:** 2026-09-01

---

## At a glance

| Layer | Choice | Version |
|---|---|---|
| UI framework | React (no framework on top) | 19.2 |
| Build tool | Vite (Rolldown) | 8.2 |
| Language | JavaScript (ESM, JSX). No TypeScript. | — |
| Styling | Plain hand-written CSS, one file | — |
| State | React `useState` + `localStorage`. No state library. | — |
| Icons | Iconify React + simple-icons, **bundled offline** | 6.0 / 1.2 |
| Charts | Hand-rolled SVG. **No chart library.** | — |
| PDF parsing | pdf.js (`pdfjs-dist`), lazy-loaded | 6.3 |
| PWA / offline | vite-plugin-pwa (Workbox `generateSW`) | 1.3 |
| Tests | Vitest | 4.1 |
| Lint | ESLint 10 flat config + react-hooks plugin | 10.9 / 7.1 |
| Backend | Vercel Serverless Functions (Node, CommonJS) | — |
| Auth gate | Vercel Edge Middleware (ESM, Web Crypto) | — |
| Auth | Google OAuth2 authorization code + HMAC-signed cookie | — |
| Hosting | Vercel (`main` auto-deploys) | — |
| CI | GitHub Actions (Node 22) — lint, test, build on every push | — |

## Dependencies (complete)

**Runtime** — `react`, `react-dom`, `@iconify/react`, `pdfjs-dist`

**Dev** — `vite`, `@vitejs/plugin-react`, `vite-plugin-pwa`, `vitest`, `eslint`,
`@eslint/js`, `eslint-plugin-react-hooks`, `globals`, `@iconify-json/simple-icons`

That is the whole list. No UI kit, no CSS framework, no chart library, no date
library, no state manager, no ORM, no HTTP client (plain `fetch`).

## Commands

```bash
npm install
npm run dev      # Vite dev server
npm test         # Vitest, single run
npm run lint     # ESLint
npm run build    # production build into dist/
```

## Architecture notes worth carrying to another project

- **Pure engine, separate file.** All portfolio math lives in `src/engine.js` as
  pure functions with no React and no DOM, and is unit-tested directly. The UI
  never computes anything non-trivial inline. This is the single highest-value
  structural decision here.
- **Local-first data.** Portfolio state is `localStorage` under a versioned key
  (`portfolio_roadmap_v4`) with a migration path from the previous version. The
  backend holds no user data.
- **API keys stay server-side.** The browser calls `/api/market/*`; those
  functions call the market providers with keys from environment variables, with
  provider fallback chains and a TTL cache.
- **Edge middleware as the auth gate.** `middleware.js` verifies the signed
  session cookie with `crypto.subtle` before any route renders. The Node
  functions sign with `crypto.createHmac`; only the Edge runtime verifies.
- **Icons bundled, not fetched.** CSP is `connect-src 'self'`, so the Iconify
  API is unreachable by design. `scripts/gen-icons.cjs` extracts the icon bodies
  at build time into `src/brandIcons.js`. Binary icon files were removed
  entirely — they were a recurring source of silent MIME/ORB failures.
- **Charts sized in real CSS pixels.** The SVG `viewBox` width tracks the
  measured container (ResizeObserver), so an 11px axis label is 11px in a wide
  chart and in a narrow card alike. A fixed `viewBox` scales text with the
  container and makes small charts illegible.
- **ESLint react-hooks: `rules-of-hooks` + `exhaustive-deps` only.** The v7
  `recommended` preset includes React Compiler rules that fail on ordinary
  React 18 code.

## Layout

```
src/
  main.jsx                 entry point
  PortfolioRoadmap.jsx     app shell, state, all UI components
  engine.js  engine.test.js    pure DCA/allocation/analytics math
  styles.css
  brandIcons.js            generated — do not edit by hand
  services/
    marketData.js  .test.js    quote/FX client, P&L model, snapshots
    brokerImport.js .test.js   Trade Republic CSV/PDF parsers
api/
  auth/    login.js callback.js logout.js _lib.js
  market/  quotes.js fx.js snapshots.js
middleware.js              Edge auth gate
scripts/gen-icons.cjs      bundles Iconify icon bodies offline
vercel.json                security headers (incl. CSP) + SPA rewrites
vite.config.js             React plugin + PWA/Workbox config
eslint.config.mjs          flat config
.github/workflows/ci.yml   lint / test / build
```

## Environment variables

Set in Vercel. None are needed for `npm run dev` except live market data.

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth2 client |
| `SESSION_SECRET` | HMAC key for the session cookie |
| `ALLOWED_EMAIL` | single-user allowlist |
| `TWELVE_DATA_API_KEY` | equities/ETF quotes (primary) |
| `FINNHUB_API_KEY`, `POLYGON_API_KEY` | equities fallbacks |
| `COINMARKETCAP_API_KEY` | crypto fallback (CoinGecko needs no key) |

## Changelog

| Date | Change |
|---|---|
| 2026-09-01 | Stack modernised: React 19, Vite 8 (Rolldown bundler — build 1.9s to 0.6s), @vitejs/plugin-react 6 (oxc transform, no Babel), pdfjs-dist 6, ESLint 10.9.1. CI moved to Node 22 (Vite 8 requires ^20.19 or >=22.12). |
| 2026-09-01 | Analytics tab added — hand-rolled SVG charts, no chart library. `engine.js` gains the analytics data layer. |
| 2026-09-01 | Icons moved to Iconify with offline bundling; all binary icon assets deleted. |
| 2026-09-01 | Auth error pages rewritten to name the actual OAuth failure cause. |
| 2026-08-27 | Google OAuth2 + Edge middleware replaced HTTP Basic auth; `/api/*` brought behind the session gate. |
| 2026-08-27 | Vitest, ESLint 10 flat config, and GitHub Actions CI added. `engine.js` extracted as a pure module. |
| 2026-08-27 | vite-plugin-pwa added (real service worker, offline after first load). |
