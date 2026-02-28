# DCA Engine — Portfolio Rebalancing

> Dollar-Cost Averaging rebalancing engine. Track, project, and rebalance your portfolio with intelligent monthly allocation.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-dca--engine.vercel.app-0fba48?style=flat-square&logo=vercel)](https://dca-engine.vercel.app)
![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)
![Vite](https://img.shields.io/badge/Vite-5-646cff?style=flat-square&logo=vite)
![Zero Backend](https://img.shields.io/badge/Backend-None-gray?style=flat-square)

---

![DCA Engine Dashboard](https://dca-engine.vercel.app/og-image.svg)

---

## Features

- **Gap-weighted DCA allocation** — buys the most under-weight assets first each month
- **Multi-month projection** — simulate 1–12 months of contributions
- **Platform selector** — Trade Republic, Interactive Brokers, Revolut, eToro, DEGIRO, Robinhood, Coinbase, Binance, Scalable Capital, and more
- **Auto light/dark theme** — follows system preference + time-of-day (07:00–20:00)
- **Inline DCA quick-edit** — click the pill in the header to change your monthly budget
- **What-If DCA slider** — test different budgets per month tab without committing
- **Lock-in workflow** — confirm buys, apply to portfolio, and record monthly history
- **Safety valve + drift analysis** — health tab shows allocation drift and rebalancing pressure
- **Export / Import** — JSON backup, CSV export, full import restore
- **Currency selector** — €, $, £, CHF
- **PWA-ready** — installable, works offline after first load
- **Zero backend** — all data in localStorage, no account needed

## Getting Started

```bash
npm install
npm run dev      # → http://localhost:5173
npm run build    # production build → dist/
npm run preview  # preview production build
```

Deploy on [Vercel](https://vercel.com) — auto-detects Vite, zero config needed.

## Stack

| Layer | Technology |
|-------|------------|
| UI | React 18 |
| Bundler | Vite 5 |
| Styling | CSS-in-JS (inline `getCSS()`) |
| Storage | `localStorage` (schema v3) |
| Hosting | Vercel |
| Dependencies | None (zero runtime deps) |

## Project Structure

```
src/
  PortfolioRoadmap.jsx   # entire app — single-file architecture
public/
  favicon.svg            # brand icon
  og-image.svg           # Open Graph / social preview
  site.webmanifest       # PWA manifest
index.html               # SEO, OG tags, JSON-LD
vercel.json              # security headers + SPA rewrites
```

## License

MIT — Andrew Fragkiadakis
