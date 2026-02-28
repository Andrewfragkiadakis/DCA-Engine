# Portfolio Roadmap

> DCA Rebalancing Engine — Trade Republic

A personal portfolio tracker and monthly allocation calculator. Runs entirely in the browser, data stored locally.

## Features

- Monthly DCA allocation engine (buy-only, gap-weighted)
- Multi-month projection (1–12 months)
- Auto light/dark theme (system + time-of-day)
- Export/import JSON backup + CSV export
- Lock-in workflow with monthly history
- Currency selector (€ $ £ CHF)
- Full settings: assets, targets, DCA amount
- Security headers via Vercel

## Deploy

```bash
npm install
npm run dev      # local dev
npm run build    # production build → dist/
```

Deploy the repo on [Vercel](https://vercel.com) — it auto-detects Vite.

## Stack

- React 18 + Vite
- Zero external runtime dependencies
- localStorage persistence (schema-versioned)
