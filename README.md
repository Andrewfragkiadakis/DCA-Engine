# DCA Engine — Portfolio Rebalancing

> Personal Dollar-Cost Averaging rebalancing tool for a single Trade Republic account (EUR). Track real holdings, project future contributions, and rebalance with gap-weighted monthly allocation.

![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)
![Vite](https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite)
![License: MIT](https://img.shields.io/badge/License-MIT-0ea5e9?style=flat-square)

This is a private, single-user app — it is not indexed by search engines and is gated behind Google sign-in restricted to one allowed email address. See [Setup](#setup) below.

---

## Features

- **Gap-weighted DCA allocation** — buys the most under-weight assets first each month
- **Holdings-based live valuation** — set units/shares/coins owned; current value auto-updates from live prices instead of staying a stale manual number
- **Real cost-basis tracking** — Total Return reflects actual money invested (grows via Lock In), not an arbitrary "since tracking began" snapshot
- **Plan tab** — a single month-by-month stepper (not a tab per month) plus the full projection-horizon health outlook
- **Auto light/dark theme** — follows system preference + time-of-day (07:00–20:00)
- **DCA picker + schedule** — presets, custom amounts, and future scheduled changes (e.g. a salary increase) that auto-apply once, without fighting manual edits afterward
- **Safety valve + drift analysis** — flags allocation drift and suggests rebalancing amounts
- **Live market proxy (serverless)** — quotes fetched through `/api/market/*` so API keys never reach the browser
- **Provider routing by asset class** — equities/ETF via Twelve Data → Finnhub → Polygon, crypto via CoinGecko → CoinMarketCap → Binance, with correct per-symbol currency conversion (EUR, USD, GBp all handled)
- **Trade Republic import** — CSV and PDF (securities + crypto statements) import with holdings/ISIN-aware merging
- **Weekly auto-backup** — downloads a JSON snapshot automatically so a cleared browser never means total data loss
- **Google sign-in** — single-user allowlist via OAuth2, no shared password
- **Installable PWA** — real service worker, works offline after first load
- **Local-first data model** — portfolio data lives in `localStorage`; the backend only proxies market data and auth

## Getting Started

```bash
npm install
npm run dev      # → http://localhost:5173
npm run build    # production build → dist/
npm run preview  # preview production build
npm test         # run the Vitest suite
npm run lint     # run ESLint
```

## Setup

This app requires environment variables in your Vercel project (Project → Settings → Environment Variables):

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth2 credentials from a Google Cloud project (APIs & Services → Credentials → OAuth client ID, type "Web application"). Add `https://<your-domain>/api/auth/callback` as an authorized redirect URI. |
| `SESSION_SECRET` | A long random string used to sign session cookies. Generate with `openssl rand -hex 32`. |
| `ALLOWED_EMAIL` | The one Google account email allowed to sign in. |
| `TWELVE_DATA_API_KEY` / `FINNHUB_API_KEY` / `POLYGON_API_KEY` | Optional — enable live equity/ETF quotes. Crypto (BTC/ETH) works keyless via CoinGecko. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Optional — enables remote price-snapshot persistence. |

Sign-in flow: `/api/auth/login` → Google consent screen → `/api/auth/callback` verifies the email against `ALLOWED_EMAIL` and issues a signed session cookie. `middleware.js` gates every route (including `/api/market/*`) on that cookie. Sign out from the header icon or `/api/auth/logout`.

## Stack

| Layer | Technology |
|-------|------------|
| UI | React 18 |
| Bundler | Vite 7 |
| Styling | Plain CSS (`src/styles.css`) |
| Engine | Pure functions in `src/engine.js`, unit-tested with Vitest |
| Storage | `localStorage` (schema v4) + optional Supabase snapshots |
| Auth | Google OAuth2 + signed session cookie, enforced in `middleware.js` (Edge) |
| API Proxy | Vercel Serverless Functions (`/api/market/*`, `/api/auth/*`) |
| Hosting | Vercel |
| CI | GitHub Actions — lint, test, build on every push |

## Project Structure

```
src/
  PortfolioRoadmap.jsx     # app shell, state, and UI components
  engine.js                # pure DCA/allocation math — unit tested
  engine.test.js
  styles.css
  services/
    marketData.js          # quote/fx client + PnL model + snapshots
    marketData.test.js
    brokerImport.js        # Trade Republic CSV/PDF parsers
    brokerImport.test.js
api/
  auth/
    login.js, callback.js, logout.js, _lib.js   # Google OAuth2 + session cookie
  market/
    quotes.js              # market provider proxy + TTL cache
    fx.js                  # FX conversion proxy + TTL cache
    snapshots.js           # optional Supabase persistence bridge
public/
  icon-192.png, icon-512.png, site.webmanifest  # PWA install assets
  robots.txt              # disallow all (private app)
middleware.js              # Edge auth gate for every route
vercel.json                # security headers + SPA rewrites
eslint.config.mjs
.github/workflows/ci.yml
```

## License

Licensed under the [MIT License](LICENSE).
