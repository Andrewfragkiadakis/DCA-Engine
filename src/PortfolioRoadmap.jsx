/**
 * Portfolio Roadmap — DCA Rebalancing Engine v3
 * All bugs fixed, production-ready, Vercel-deployable.
 *
 * FIXES IN THIS VERSION:
 *  ✅ Copy button: robust clipboard API + textarea execCommand fallback
 *  ✅ Export JSON/CSV: anchor appended to DOM before click, then removed
 *  ✅ Import: dead loadState.call() removed, clean parse pipeline
 *  ✅ Font sizes enlarged throughout with responsive type scale
 *  ✅ Schema v3 with forward-migration from v2
 *
 * FEATURES:
 *  ✅ Inline DCA quick-edit in header
 *  ✅ What-If DCA slider on month tabs
 *  ✅ Portfolio value sparkline in history
 *  ✅ Auto light/dark theme (system + time-of-day, 07:00–20:00)
 *  ✅ Currency selector (€ $ £ CHF)
 *  ✅ Export JSON backup / Export CSV / Import JSON
 *  ✅ Target normalise button
 *  ✅ Confirm modal before Lock In (with optional notes)
 *  ✅ Per-month gain/loss delta in history
 *  ✅ Safety valve + drift analysis
 *  ✅ Projection horizon 1–12 months
 *  ✅ Error Boundary with recovery screen
 *  ✅ Full keyboard shortcuts (ESC closes modals)
 *  ✅ Full ARIA labels + roles
 *  ✅ Print-friendly CSS
 */

import { useState, useEffect, useMemo, useCallback, useRef, Component } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────
const SCHEMA_VERSION = 3;
const STORE_KEY      = "portfolio_roadmap_v3";
const CURRENCIES     = ["€", "$", "£", "CHF"];
const CATEGORIES     = ["Crypto", "Tech", "Dividend", "ETF", "Bond", "Commodity", "Other"];
const CAT_COLORS     = {
  Crypto: "#FF9800", Tech: "#5C6BC0", Dividend: "#66BB6A",
  ETF: "#42A5F5",   Bond: "#AB47BC", Commodity: "#EC407A", Other: "#78909C",
};
const CAT_ICONS = {
  Crypto: "coins", Tech: "laptop", Dividend: "handDollar",
  ETF: "layers", Bond: "shield", Commodity: "star", Other: "barChart",
};
const PLATFORMS = [
  { id: "trade-republic",      name: "Trade Republic",      color: "#0fba48" },
  { id: "interactive-brokers", name: "Interactive Brokers", color: "#e31837" },
  { id: "revolut",             name: "Revolut",             color: "#4c6ef5" },
  { id: "etoro",               name: "eToro",               color: "#11a65c" },
  { id: "degiro",              name: "DEGIRO",              color: "#004990" },
  { id: "robinhood",           name: "Robinhood",           color: "#00c805" },
  { id: "coinbase",            name: "Coinbase",            color: "#0052ff" },
  { id: "binance",             name: "Binance",             color: "#f3ba2f" },
  { id: "scalable",            name: "Scalable Capital",    color: "#6c3af5" },
  { id: "other",               name: "Other",               color: "#78909c" },
];

// ─── SVG ICON LIBRARY ─────────────────────────────────────────
const Icons = {
  bitcoin:     <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.546z"/><path fill="rgba(0,0,0,0.35)" d="M17.655 10.435c.228-1.528-.937-2.35-2.532-2.899l.517-2.072-1.262-.314-.503 2.017-1.012-.238.507-2.03-1.261-.315-.517 2.072-.821-.194-1.741-.435-.336 1.347.917.228c.511.128.604.466.588.734l-.59 2.365.131.042-.133-.033-.827 3.317c-.063.155-.221.389-.579.3-.917-.229-.917-.229l-.627 1.44 1.643.41.9.232-.522 2.095 1.26.314.518-2.074 1.002.26-.515 2.064 1.262.315.522-2.091c2.153.408 3.772.243 4.454-1.704.549-1.567-.027-2.471-1.161-3.059.826-.19 1.448-.734 1.614-1.857zM15.1 14.445c-.39 1.567-3.032.72-3.888.508l.694-2.78c.856.214 3.601.637 3.194 2.272zm.39-3.54c-.356 1.427-2.553.702-3.265.524l.629-2.524c.712.178 3.006.509 2.636 2z"/></svg>,
  ethereum:    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003zM12.056 0L4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z"/></svg>,
  microchip:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M7 9H4M7 12H4M7 15H4M17 9h3M17 12h3M17 15h3M9 7V4M12 7V4M15 7V4M9 17v3M12 17v3M15 17v3"/></svg>,
  apple:       <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>,
  microsoft:   <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/></svg>,
  circleDot:   <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"/></svg>,
  plus:        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  chartPie:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z" fill="currentColor" stroke="none"/></svg>,
  globe:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  handDollar:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  barChart:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="6" width="4" height="15" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>,
  bullseye:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  wallet:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>,
  calendar:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  trendUp:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  sliders:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>,
  shield:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10" stroke="#10b981" strokeWidth="2"/></svg>,
  shieldWarn:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="9" x2="12" y2="13" stroke="#ef4444" strokeWidth="2"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="#ef4444" strokeWidth="2"/></svg>,
  coins:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>,
  laptop:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M2 20h20"/></svg>,
  layers:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  check:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  sigma:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 7H6l6 5-6 5h12"/></svg>,
  circleCheck: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>,
  arrows:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M5 12l4-4M5 12l4 4M19 12l-4-4M19 12l-4 4"/></svg>,
  warning:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  star:        <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  halfCircle:  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/></svg>,
  info:        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  edit:        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  lock:        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  trash:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  settings:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  close:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  addAsset:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  history:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/></svg>,
  copy:        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  download:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  upload:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  sun:         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  moon:        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  auto:        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>,
  normalize:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  note:        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  zap:         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  target:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="22" y1="12" x2="15" y2="12"/><line x1="9" y1="12" x2="2" y2="12"/></svg>,
  refresh:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
};
const PLATFORM_ICONS = {
  "trade-republic":      <svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#0fba48"/><path d="M7 12l3.5 3.5L17 8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  "interactive-brokers": <svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#e31837"/><path d="M8 7v10M16 7v10M8 12h8" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>,
  "revolut":             <svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="12" fill="#191c4b"/><path d="M9 7h3.5c2 0 3.5 1.2 3.5 3s-1.5 3-3.5 3H9V7zM9 13l4 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  "etoro":               <svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#11a65c"/><circle cx="12" cy="9" r="3" fill="#fff"/><path d="M6 19c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  "degiro":              <svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#004990"/><circle cx="12" cy="13" r="4" stroke="#fff" strokeWidth="1.8"/><rect x="11" y="5" width="2" height="4" rx="1" fill="#fff"/></svg>,
  "robinhood":           <svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="12" fill="#00c805"/><path d="M12 17V8M8 11l4-4 4 4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  "coinbase":            <svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#0052ff"/><circle cx="12" cy="12" r="6" fill="#fff"/><path d="M14.5 9.5a3 3 0 0 0-5 2.5 3 3 0 0 0 5 2.5" stroke="#0052ff" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  "binance":             <svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#1a1a2e"/><path d="M12 5l2 2-2 2-2-2 2-2zM5 12l2-2 2 2-2 2-2-2zM19 12l-2-2-2 2 2 2 2-2zM12 19l-2-2 2-2 2 2-2 2zM10.5 12l1.5-1.5 1.5 1.5-1.5 1.5-1.5-1.5z" fill="#f3ba2f"/></svg>,
  "scalable":            <svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#6c3af5"/><rect x="5" y="15" width="3" height="4" rx="1" fill="#fff"/><rect x="10.5" y="11" width="3" height="8" rx="1" fill="#fff"/><rect x="16" y="7" width="3" height="12" rx="1" fill="#fff"/></svg>,
  "other":               <svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#78909c"/><circle cx="8" cy="12" r="1.5" fill="#fff"/><circle cx="12" cy="12" r="1.5" fill="#fff"/><circle cx="16" cy="12" r="1.5" fill="#fff"/></svg>,
};

function Icon({ name, style, className }) {
  const svg = Icons[name];
  if (!svg) return null;
  return (
    <span className={`svg-icon${className ? " " + className : ""}`} style={style} aria-hidden="true">
      {svg}
    </span>
  );
}
function PlatformBadge({ platformId }) {
  const p = PLATFORMS.find(x => x.id === platformId) || PLATFORMS[0];
  return (
    <span className="platform-badge" style={{ "--p-color": p.color }}>
      <span className="platform-ico" aria-hidden="true">{PLATFORM_ICONS[p.id]}</span>
      <span>{p.name}</span>
    </span>
  );
}

// ─── CLIPBOARD UTILITY (with fallback) ────────────────────────
function copyToClipboard(text) {
  // Modern API — works on HTTPS
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for HTTP / older browsers
  return new Promise((resolve, reject) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("execCommand failed"));
    } catch (e) {
      document.body.removeChild(ta);
      reject(e);
    }
  });
}

// ─── DOWNLOAD UTILITY ─────────────────────────────────────────
function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Clean up after small delay (some browsers need it)
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 150);
}

// ─── SANITISATION ─────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
function sanitizeNum(v, lo, hi, fallback) {
  const n = parseFloat(v);
  return isNaN(n) || !isFinite(n) ? fallback : clamp(n, lo, hi);
}
function sanitizeStr(v, maxLen = 32) {
  if (typeof v !== "string") return "";
  return v.replace(/[<>"'`]/g, "").trim().slice(0, maxLen);
}
function sanitizeAsset(a) {
  if (!a || typeof a !== "object") return null;
  return {
    name:    sanitizeStr(a.name || "Asset", 40),
    ticker:  sanitizeStr((a.ticker || "???").toUpperCase(), 10).replace(/[^A-Z0-9.&]/g, "") || "???",
    cat:     CATEGORIES.includes(a.cat) ? a.cat : "Other",
    current: sanitizeNum(a.current, 0, 10_000_000, 0),
    target:  sanitizeNum(a.target,  0, 100, 0),
    icon:    typeof a.icon === "string" && Icons[a.icon] ? a.icon : "barChart",
  };
}

// ─── DEFAULT DATA ─────────────────────────────────────────────
const DEFAULT_ASSETS = [
  { name:"BTC",            ticker:"BTC",  cat:"Crypto",   current:178,  target:11.5,  icon:"bitcoin"    },
  { name:"ETH",            ticker:"ETH",  cat:"Crypto",   current:87,   target:6.0,   icon:"ethereum"   },
  { name:"NVIDIA",         ticker:"NVDA", cat:"Tech",     current:163,  target:6.67,  icon:"microchip"  },
  { name:"Apple",          ticker:"AAPL", cat:"Tech",     current:148,  target:6.67,  icon:"apple"      },
  { name:"Microsoft",      ticker:"MSFT", cat:"Tech",     current:118,  target:6.67,  icon:"microsoft"  },
  { name:"Coca-Cola",      ticker:"KO",   cat:"Dividend", current:239,  target:8.75,  icon:"circleDot"  },
  { name:"J&J",            ticker:"JNJ",  cat:"Dividend", current:252,  target:8.75,  icon:"plus"       },
  { name:"S&P 500 ETF",    ticker:"SPY",  cat:"ETF",      current:434,  target:18.0,  icon:"chartPie"   },
  { name:"FTSE All World", ticker:"VWCE", cat:"ETF",      current:367,  target:15.0,  icon:"globe"      },
  { name:"Hi Div ETF",     ticker:"VHYL", cat:"ETF",      current:249,  target:12.0,  icon:"handDollar" },
];
const DEFAULT_STATE = {
  schemaVersion: SCHEMA_VERSION,
  assets: DEFAULT_ASSETS.map(a => ({ ...a })),
  dca: 130,
  currency: "€",
  theme: "auto",
  projectionMonths: 3,
  history: [],
  platform: "trade-republic",
};

// ─── STORAGE (versioned) ──────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    // Schema migration: accept v2 and v3, reject everything else
    if (p.schemaVersion !== SCHEMA_VERSION && p.schemaVersion !== 2) return null;
    if (!Array.isArray(p.assets) || p.assets.length === 0) return null;
    const seen = new Set();
    const assets = p.assets.map(sanitizeAsset).filter(a => {
      if (!a || seen.has(a.ticker)) return false;
      seen.add(a.ticker);
      return true;
    });
    if (assets.length === 0) return null;
    return {
      ...DEFAULT_STATE,
      ...p,
      assets,
      dca:              sanitizeNum(p.dca, 1, 1_000_000, 130),
      currency:         CURRENCIES.includes(p.currency) ? p.currency : "€",
      theme:            ["dark","light","auto"].includes(p.theme) ? p.theme : "auto",
      projectionMonths: sanitizeNum(p.projectionMonths, 1, 12, 3),
      history:          Array.isArray(p.history) ? p.history.slice(-120) : [],
      schemaVersion:    SCHEMA_VERSION,
      platform:         PLATFORMS.some(x => x.id === p.platform) ? p.platform : "trade-republic",
    };
  } catch { return null; }
}
function saveState(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...s, schemaVersion: SCHEMA_VERSION })); } catch {}
}

// ─── THEME HELPERS ────────────────────────────────────────────
function resolveTheme(pref) {
  if (pref === "light") return "light";
  if (pref === "dark")  return "dark";
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  const h = new Date().getHours();
  return h >= 7 && h < 20 ? "light" : "dark";
}

// ─── ENGINE ───────────────────────────────────────────────────
function enrich(list, total) {
  return list.map(a => {
    const pct   = total > 0 ? (a.current / total) * 100 : 0;
    const drift = pct - a.target;
    const gap   = (a.target / 100) * total - a.current;
    return { ...a, pct, drift, gap };
  });
}

function allocate(portfolio, total, budget) {
  if (budget <= 0) return [];
  const items     = enrich(portfolio, total);
  const under     = items.filter(i => i.gap > 0).sort((a, b) => b.gap - a.gap);
  const totalGap  = under.reduce((s, i) => s + i.gap, 0);
  if (totalGap <= 0 || under.length === 0) {
    const each = Math.floor(budget / items.length);
    const rem  = budget - each * items.length;
    return items.map((i, idx) => ({ ...i, buy: each + (idx === 0 ? rem : 0) })).filter(i => i.buy > 0);
  }
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

function runProjection(assets, total, dca, months) {
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

// ─── EXPORT HELPERS ───────────────────────────────────────────
function exportJSON(state) {
  const payload = { ...state, schemaVersion: SCHEMA_VERSION };
  triggerDownload(
    JSON.stringify(payload, null, 2),
    `portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`,
    "application/json"
  );
}

function exportCSV(assets, currency) {
  const total = assets.reduce((s, a) => s + a.current, 0);
  const header = ["Ticker", "Name", "Category", `Current Value (${currency})`, "Target %", "Actual %", "Drift %"].join(",");
  const rows = enrich(assets, total).map(a =>
    [a.ticker, `"${a.name}"`, a.cat, a.current.toFixed(2), a.target.toFixed(2), a.pct.toFixed(2), a.drift.toFixed(2)].join(",")
  );
  triggerDownload(
    [header, ...rows].join("\n"),
    `portfolio-${new Date().toISOString().slice(0, 10)}.csv`,
    "text/csv;charset=utf-8;"
  );
}

// ─── ERROR BOUNDARY ───────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e, info) { console.error("Portfolio Roadmap error:", e, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#0a0f1a", color:"#e2e8f0", fontFamily:"system-ui,sans-serif", flexDirection:"column", gap:16, padding:24, textAlign:"center" }}>
        <div style={{ fontSize:52 }}>⚠️</div>
        <h2 style={{ fontSize:22, fontWeight:700 }}>Something went wrong</h2>
        <p style={{ color:"#64748b", maxWidth:400, lineHeight:1.7, fontSize:15 }}>
          {this.state.error?.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={() => { localStorage.removeItem(STORE_KEY); window.location.reload(); }}
          style={{ marginTop:8, padding:"12px 24px", background:"#6366f1", border:"none", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer", fontSize:15 }}
        >
          Reset & Reload
        </button>
        <p style={{ fontSize:12, color:"#475569" }}>Local data will be cleared. Your positions will return to defaults.</p>
      </div>
    );
  }
}

// ─── ROOT ─────────────────────────────────────────────────────
export default function PortfolioRoadmap() {
  return <ErrorBoundary><App /></ErrorBoundary>;
}

// ─── APP ──────────────────────────────────────────────────────
function App() {
  const [state, setState]       = useState(() => loadState() || { ...DEFAULT_STATE, assets: DEFAULT_ASSETS.map(a => ({ ...a })) });
  const [tab, setTab]           = useState(0);
  const [loaded, setLoaded]     = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast]       = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmLock, setConfirmLock]   = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [activeTheme, setActiveTheme]   = useState(() => resolveTheme(loadState()?.theme || "auto"));
  const [editingDca, setEditingDca]     = useState(false);
  const [dcaDraft, setDcaDraft]         = useState(String(state.dca));
  const toastRef    = useRef(null);
  const fileInputRef = useRef(null);

  // Theme
  useEffect(() => {
    const t = resolveTheme(state.theme);
    setActiveTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }, [state.theme]);
  useEffect(() => {
    if (state.theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => { const t = resolveTheme("auto"); setActiveTheme(t); document.documentElement.setAttribute("data-theme", t); };
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [state.theme]);
  useEffect(() => {
    if (state.theme !== "auto") return;
    const id = setInterval(() => { const t = resolveTheme("auto"); setActiveTheme(t); document.documentElement.setAttribute("data-theme", t); }, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [state.theme]);

  useEffect(() => { setTimeout(() => setLoaded(true), 80); }, []);
  useEffect(() => { saveState(state); }, [state]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") { setSettingsOpen(false); setConfirmLock(false); setConfirmReset(false); setEditingDca(false); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const showToast = useCallback((msg, type = "success") => {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({ msg, type });
    toastRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // ── Derived ──
  const total      = useMemo(() => state.assets.reduce((s, a) => s + a.current, 0), [state.assets]);
  const enriched   = useMemo(() => enrich(state.assets, total), [state.assets, total]);
  const sortedDrift = useMemo(() => [...enriched].sort((a, b) => a.drift - b.drift), [enriched]);
  const targetSum  = useMemo(() => state.assets.reduce((s, a) => s + a.target, 0), [state.assets]);
  const targetOk   = useMemo(() => Math.abs(targetSum - 100) < 0.05, [targetSum]);
  const safetyBreach = useMemo(() => enriched.find(a => a.pct > a.target + 5), [enriched]);

  const projection = useMemo(
    () => runProjection(state.assets, total, state.dca, state.projectionMonths),
    [state.assets, total, state.dca, state.projectionMonths]
  );
  const projAvgDrift = useMemo(() =>
    projection.finalPort.reduce((s, a) => s + Math.abs(a.drift), 0) / (projection.finalPort.length || 1),
    [projection.finalPort]
  );
  const projMaxDrift = useMemo(() => Math.max(0, ...projection.finalPort.map(a => Math.abs(a.drift))), [projection.finalPort]);
  const projAligned  = useMemo(() => projection.finalPort.filter(a => Math.abs(a.drift) < 1).length, [projection.finalPort]);
  const cy = state.currency;

  // ── Handlers ──
  const updateAsset = useCallback((ticker, field, raw) => {
    setState(s => ({
      ...s,
      assets: s.assets.map(a => {
        if (a.ticker !== ticker) return a;
        if (field === "current") return { ...a, current: sanitizeNum(raw, 0, 10_000_000, a.current) };
        if (field === "target")  return { ...a, target: sanitizeNum(raw, 0, 100, a.target) };
        if (field === "ticker") {
          const clean = sanitizeStr(String(raw).toUpperCase(), 10).replace(/[^A-Z0-9.&]/g, "");
          if (!clean || s.assets.some(x => x.ticker === clean && x.ticker !== ticker)) return a;
          return { ...a, ticker: clean };
        }
        if (field === "name") return { ...a, name: sanitizeStr(raw, 40) };
        if (field === "cat")  return { ...a, cat: CATEGORIES.includes(raw) ? raw : a.cat };
        if (field === "icon") return { ...a, icon: Icons[raw] ? raw : a.icon };
        return a;
      }),
    }));
  }, []);

  const updateDca = useCallback((v) => {
    const n = sanitizeNum(v, 1, 1_000_000, state.dca);
    setState(s => ({ ...s, dca: n }));
    setDcaDraft(String(n));
  }, [state.dca]);

  const commitDca = useCallback(() => {
    updateDca(dcaDraft);
    setEditingDca(false);
    showToast("DCA updated");
  }, [dcaDraft, updateDca, showToast]);

  const normalizeTargets = useCallback(() => {
    setState(s => {
      const sum = s.assets.reduce((acc, a) => acc + a.target, 0);
      if (sum === 0) return s;
      const f = 100 / sum;
      let runSum = 0;
      return {
        ...s,
        assets: s.assets.map((a, i) => {
          if (i === s.assets.length - 1) {
            return { ...a, target: Math.round((100 - runSum) * 100) / 100 };
          }
          const t = Math.round(a.target * f * 100) / 100;
          runSum += t;
          return { ...a, target: t };
        }),
      };
    });
    showToast("Targets normalised to 100%");
  }, [showToast]);

  const addAsset = useCallback(() => {
    setState(s => ({
      ...s,
      assets: [...s.assets, { name:"New Asset", ticker:`NEW${s.assets.length}`, cat:"ETF", current:0, target:0, icon:"barChart" }],
    }));
  }, []);

  const removeAsset = useCallback((ticker) => setState(s => ({ ...s, assets: s.assets.filter(a => a.ticker !== ticker) })), []);

  const updatePlatform = useCallback((id) => {
    setState(s => ({ ...s, platform: id }));
    showToast("Platform updated");
  }, [showToast]);

  const doLockMonth = useCallback((note = "") => {
    const step = projection.steps[0];
    if (!step) return;
    const snap = {
      label: `Month ${state.history.length + 1}`,
      assets: state.assets.map(a => ({ ...a })),
      total,
      buys: step.buys,
      completedAt: new Date().toISOString(),
      note: sanitizeStr(note, 500),
    };
    const newAssets = state.assets.map(a => {
      const b = step.buys.find(x => x.ticker === a.ticker);
      return b ? { ...a, current: Math.round((a.current + b.buy) * 100) / 100 } : { ...a };
    });
    setState(s => ({ ...s, assets: newAssets, history: [...s.history, snap] }));
    setConfirmLock(false);
    setTab(0);
    showToast(`Month ${state.history.length + 1} locked — portfolio updated!`);
  }, [projection, state.assets, state.history.length, total, showToast]);

  const hardReset = useCallback(() => {
    setState({ ...DEFAULT_STATE, assets: DEFAULT_ASSETS.map(a => ({ ...a })) });
    setConfirmReset(false);
    showToast("Portfolio reset to defaults.", "info");
  }, [showToast]);

  // ── Import ──
  const handleImport = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so same file can be re-imported
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = ev.target.result;
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) throw new Error("Not an object");
        // Accept v2 and v3 backups
        if (parsed.schemaVersion !== SCHEMA_VERSION && parsed.schemaVersion !== 2) {
          showToast("Incompatible backup version (expected v2 or v3).", "error");
          return;
        }
        if (!Array.isArray(parsed.assets) || parsed.assets.length === 0) {
          showToast("No assets found in backup file.", "error");
          return;
        }
        const seen = new Set();
        const assets = parsed.assets.map(sanitizeAsset).filter(a => {
          if (!a || seen.has(a.ticker)) return false;
          seen.add(a.ticker);
          return true;
        });
        if (assets.length === 0) {
          showToast("Could not load any valid assets.", "error");
          return;
        }
        setState({
          ...DEFAULT_STATE,
          dca:              sanitizeNum(parsed.dca, 1, 1_000_000, 130),
          currency:         CURRENCIES.includes(parsed.currency) ? parsed.currency : "€",
          theme:            ["dark","light","auto"].includes(parsed.theme) ? parsed.theme : "auto",
          projectionMonths: sanitizeNum(parsed.projectionMonths, 1, 12, 3),
          history:          Array.isArray(parsed.history) ? parsed.history.slice(-120) : [],
          schemaVersion:    SCHEMA_VERSION,
          platform:         PLATFORMS.some(x => x.id === parsed.platform) ? parsed.platform : "trade-republic",
          assets,
        });
        showToast(`Portfolio imported — ${assets.length} assets loaded.`);
      } catch (err) {
        showToast(`Import failed: ${err.message}`, "error");
      }
    };
    reader.onerror = () => showToast("Could not read file.", "error");
    reader.readAsText(file);
  }, [showToast]);

  const tabs = [
    { label:"Overview",   icon:"barChart", short:"Overview" },
    { label:"Month 1",    icon:"calendar", short:"M1"       },
    ...projection.steps.slice(1).map((_, i) => ({ label:`Month ${i+2}`, icon:"trendUp", short:`M${i+2}` })),
    { label:"Health",     icon:"bullseye", short:"Health"   },
    { label:"History",    icon:"history",  short:"History"  },
  ];

  return (
    <div className={`pr ${activeTheme}`}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
      <div className="pr-glow g1" aria-hidden="true"/><div className="pr-glow g2" aria-hidden="true"/>
      <input ref={fileInputRef} type="file" accept=".json" style={{ display:"none" }} onChange={handleImport} aria-hidden="true"/>

      {toast && (
        <div className={`toast toast-${toast.type || "success"}`} role="alert" aria-live="assertive">
          <Icon name={toast.type === "error" ? "warning" : "circleCheck"} style={{ width:15, height:15, flexShrink:0 }}/>
          {toast.msg}
        </div>
      )}

      <div className="wrap">
        {/* ── HEADER ── */}
        <header className={`hdr ${loaded ? "in" : ""}`}>
          <div className="hdr-top">
            <div className="hdr-left">
              <div className="hdr-row">
                <div className="dot" aria-hidden="true"/>
                <span className="hdr-tag">DCA Rebalancing Engine</span>
              </div>
              <h1 className="hdr-title">Portfolio Roadmap</h1>
              <div className="hdr-sub-row">
                <span className="hdr-sub">{state.assets.length} assets · Buy-only · <PlatformBadge platformId={state.platform}/></span>
                <span className="hdr-sep">·</span>
                {editingDca ? (
                  <form className="dca-edit-form" onSubmit={e => { e.preventDefault(); commitDca(); }}>
                    <span className="dca-sym">{cy}</span>
                    <input
                      className="dca-input mono"
                      type="number" min="1" max="99999" step="10"
                      value={dcaDraft}
                      onChange={e => setDcaDraft(e.target.value)}
                      onBlur={commitDca}
                      autoFocus
                      aria-label="Monthly DCA amount"
                    />
                    <span className="hdr-sub">/mo</span>
                  </form>
                ) : (
                  <button className="dca-pill" onClick={() => { setEditingDca(true); setDcaDraft(String(state.dca)); }} title="Click to edit DCA amount">
                    <Icon name="zap" style={{ width:12, height:12 }}/>
                    <span className="mono">{cy}{state.dca}/mo</span>
                    <Icon name="edit" style={{ width:10, height:10, opacity:0.5 }}/>
                  </button>
                )}
              </div>
            </div>
            <div className="hdr-actions">
              <ThemeToggle theme={state.theme} onToggle={(t) => setState(s => ({ ...s, theme: t }))}/>
              <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings" aria-label="Open settings">
                <Icon name="settings" style={{ width:17, height:17 }}/>
              </button>
            </div>
          </div>
        </header>

        {/* ── KPIs ── */}
        <div className={`kpi-grid ${loaded ? "in" : ""}`} role="region" aria-label="Portfolio summary">
          {[
            { l:"Portfolio",          v:`${cy}${Math.round(total).toLocaleString()}`,                  s:"Current value",   c:"var(--accent-blue)",   icon:"wallet"   },
            { l:"Monthly DCA",        v:`${cy}${state.dca}`,                                           s:"Per contribution",c:"var(--accent-indigo)", icon:"zap"      },
            { l:`${state.projectionMonths}-Mo Target`, v:`${cy}${Math.round(projection.finalTotal).toLocaleString()}`, s:`+${cy}${(state.dca * state.projectionMonths).toLocaleString()}`, c:"var(--accent-green)", icon:"trendUp" },
            { l:"Proj. Drift",        v:`${projAvgDrift.toFixed(1)}%`,                                s:`Avg abs · ${state.projectionMonths}mo`, c: projAvgDrift<1?"var(--accent-green)":projAvgDrift<2.5?"var(--accent-amber)":"var(--accent-red)", icon:"sliders" },
          ].map((k, i) => (
            <div key={i} className="kpi">
              <div className="kpi-header">
                <div className="kpi-l">{k.l}</div>
                <Icon name={k.icon} style={{ color:k.c, opacity:0.5, width:14, height:14 }}/>
              </div>
              <div className="kpi-v mono" style={{ color:k.c }}>{k.v}</div>
              <div className="kpi-s">{k.s}</div>
            </div>
          ))}
        </div>

        {!targetOk && (
          <div className="banner banner-warn" role="alert">
            <Icon name="warning" style={{ width:16, height:16, flexShrink:0 }}/>
            <span>Target allocations sum to <strong>{targetSum.toFixed(2)}%</strong> — must equal 100%. Fix in Settings → Assets, or click Normalise.</span>
          </div>
        )}

        {/* ── TABS ── */}
        <div className="tabs" role="tablist" aria-label="Navigation">
          {tabs.map((t, i) => (
            <button
              key={i} role="tab" aria-selected={tab === i}
              className={`tab ${tab === i ? "active" : ""}`}
              onClick={() => setTab(i)}
            >
              <Icon name={t.icon} className="tab-ico"/>
              <span className="tab-full">{t.label}</span>
              <span className="tab-short">{t.short}</span>
            </button>
          ))}
        </div>

        {/* ── CONTENT ── */}
        <div className="content" key={tab} role="tabpanel">
          {tab === 0 && (
            <OverviewTab
              sortedDrift={sortedDrift}
              enriched={enriched}
              total={total}
              safetyBreach={safetyBreach}
              cy={cy}
              editOpen={editOpen}
              setEditOpen={setEditOpen}
              onUpdateCurrent={(ticker, val) => { updateAsset(ticker, "current", val); showToast(`${ticker} updated`); }}
              assets={state.assets}
              platformId={state.platform}
            />
          )}
          {tab >= 1 && tab <= projection.steps.length && (
            <MonthTab
              step={projection.steps[tab - 1]}
              allSteps={projection.steps}
              stepIndex={tab - 1}
              label={`Month ${tab}`}
              isFirst={tab === 1}
              dca={state.dca}
              cy={cy}
              onConfirmLock={() => setConfirmLock(true)}
              assets={state.assets}
              total={total}
              showToast={showToast}
            />
          )}
          {tab === projection.steps.length + 1 && (
            <HealthTab
              finalPort={projection.finalPort}
              finalTotal={projection.finalTotal}
              avgDrift={projAvgDrift}
              maxDrift={projMaxDrift}
              aligned={projAligned}
              cy={cy}
              months={state.projectionMonths}
            />
          )}
          {tab === projection.steps.length + 2 && (
            <HistoryTab history={state.history} cy={cy}/>
          )}
        </div>
      </div>

      {/* ── MODALS ── */}
      {settingsOpen && (
        <SettingsModal
          state={state}
          onClose={() => setSettingsOpen(false)}
          onUpdateDca={updateDca}
          onUpdateCurrency={c  => { setState(s => ({ ...s, currency: c })); showToast(`Currency set to ${c}`); }}
          onUpdateTheme={t     => setState(s => ({ ...s, theme: t }))}
          onUpdateProjection={v => setState(s => ({ ...s, projectionMonths: sanitizeNum(v, 1, 12, 3) }))}
          onUpdatePlatform={updatePlatform}
          onUpdateAsset={updateAsset}
          onAddAsset={addAsset}
          onRemoveAsset={removeAsset}
          onNormalize={normalizeTargets}
          onExportJSON={() => { exportJSON(state); showToast("JSON backup downloaded."); }}
          onExportCSV={() => { exportCSV(state.assets, cy); showToast("CSV downloaded."); }}
          onImport={() => fileInputRef.current?.click()}
          onReset={() => { setSettingsOpen(false); setConfirmReset(true); }}
          targetSum={targetSum}
          targetOk={targetOk}
          showToast={showToast}
          total={total}
        />
      )}

      {confirmLock && (
        <ConfirmModal
          icon="lock"
          iconColor="var(--accent-green)"
          title="Lock In Month 1?"
          body={`Apply ${cy}${projection.steps[0]?.buys.reduce((s, b) => s + b.buy, 0) || 0} in buys to your live portfolio. This cannot be undone.`}
          confirmLabel="Lock In & Update Portfolio"
          hasNote
          onCancel={() => setConfirmLock(false)}
          onConfirm={doLockMonth}
        />
      )}

      {confirmReset && (
        <ConfirmModal
          icon="trash"
          iconColor="var(--accent-red)"
          title="Reset Everything?"
          body="This clears all values, history and settings, restoring the sample defaults."
          confirmLabel="Yes, Reset"
          danger
          onCancel={() => setConfirmReset(false)}
          onConfirm={hardReset}
        />
      )}

      <style>{getCSS()}</style>
    </div>
  );
}

// ─── THEME TOGGLE ─────────────────────────────────────────────
function ThemeToggle({ theme, onToggle }) {
  const cycle  = { auto:"light", light:"dark", dark:"auto" };
  const iconMap = { auto:"auto", light:"sun", dark:"moon" };
  const labels  = { auto:"Auto", light:"Light", dark:"Dark" };
  return (
    <button
      className="theme-btn"
      onClick={() => onToggle(cycle[theme])}
      title={`Theme: ${labels[theme]}`}
      aria-label={`Theme is ${labels[theme]}, click to cycle`}
    >
      <Icon name={iconMap[theme]} style={{ width:14, height:14 }}/>
      <span className="theme-label">{labels[theme]}</span>
    </button>
  );
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────
function OverviewTab({ sortedDrift, enriched, total, safetyBreach, cy, editOpen, setEditOpen, onUpdateCurrent, assets, platformId }) {
  const [localVals, setLocalVals] = useState({});

  useEffect(() => {
    if (editOpen) {
      const init = {};
      assets.forEach(a => { init[a.ticker] = String(a.current); });
      setLocalVals(init);
    }
  }, [editOpen, assets]);

  const handleSaveAll = () => {
    Object.entries(localVals).forEach(([ticker, val]) => onUpdateCurrent(ticker, val));
    setEditOpen(false);
  };

  const computedTotal = useMemo(
    () => assets.reduce((s, a) => s + sanitizeNum(localVals[a.ticker] ?? a.current, 0, 10_000_000, a.current), 0),
    [localVals, assets]
  );

  return (
    <>
      <Sh title="Current Drift" subtitle="Sorted from most under-weight to most over-weight"/>
      <div className="drift-list" role="list">
        {sortedDrift.map((a, i) => {
          const c    = CAT_COLORS[a.cat] || "#6366f1";
          const ad   = Math.abs(a.drift);
          const barW = Math.min((ad / 6) * 55, 55);
          const neg  = a.drift < 0;
          const urg  = ad > 3 ? "var(--accent-red)" : ad > 1.5 ? "var(--accent-amber)" : "var(--accent-green)";
          return (
            <div key={a.ticker} className="d-row" role="listitem" style={{ animationDelay:`${i * 0.035}s` }}>
              <div className="d-left">
                <div className="d-icon" style={{ background:`${c}18`, color:c }}>
                  <Icon name={a.icon}/>
                </div>
                <div className="d-info">
                  <div className="d-ticker">{a.ticker}</div>
                  <div className="d-cat">{a.cat}</div>
                </div>
              </div>
              <div className="d-val mono">{cy}{Math.round(a.current).toLocaleString()}</div>
              <div className="d-bar-area" aria-hidden="true">
                <div className="d-bar-mid"/>
                <div className={`d-bar ${neg ? "d-bar-neg" : "d-bar-pos"}`}
                  style={{ [neg ? "right" : "left"]:"50%", width:`${barW}%`, animationDelay:`${i * 0.04}s` }}/>
              </div>
              <div className="d-pct mono" style={{ color: neg ? "var(--accent-blue)" : "var(--accent-amber)" }}>
                {a.drift >= 0 ? "+" : ""}{a.drift.toFixed(1)}%
              </div>
              <div className="d-status">
                <div className="d-pip" style={{ background:urg, boxShadow:`0 0 6px ${urg}70` }} aria-hidden="true"/>
                <span className="d-range">{a.pct.toFixed(1)}% → {a.target.toFixed(1)}%</span>
              </div>
              <div className="d-mob-drift" aria-hidden="true">
                <div className="d-mob-bar-track">
                  <div className="d-mob-bar-fill" style={{ width:`${Math.min(ad / 6 * 100, 100)}%`, background: neg ? "var(--accent-blue)" : "var(--accent-amber)" }}/>
                </div>
                <div className="d-pip" style={{ background:urg }}/>
              </div>
            </div>
          );
        })}
      </div>

      {/* Safety valve */}
      <div className={`safety ${safetyBreach ? "safety-warn" : ""}`} role={safetyBreach ? "alert" : undefined}>
        <Icon name={safetyBreach ? "shieldWarn" : "shield"} className="safety-ico" style={{ color: safetyBreach ? "var(--accent-red)" : undefined }}/>
        {safetyBreach ? (
          <div>
            <div className="safety-t" style={{ color:"var(--accent-red)" }}>Safety Alert — {safetyBreach.ticker} is {(safetyBreach.pct - safetyBreach.target).toFixed(1)}% over target</div>
            <div className="safety-d">Consider pausing buys for this asset until its allocation normalises naturally.</div>
          </div>
        ) : (
          <div>
            <div className="safety-t">Safety Valve: All Clear</div>
            <div className="safety-d">No asset exceeds its target by more than 5%. Buy-only rebalancing is safe to proceed.</div>
          </div>
        )}
      </div>

      {/* Category breakdown */}
      <Sh title="Category Breakdown" subtitle="Actual vs target allocation by asset class"/>
      <div className="cat-grid">
        {Object.keys(CAT_COLORS).filter(cat => enriched.some(a => a.cat === cat)).map(cat => {
          const ca   = enriched.filter(a => a.cat === cat);
          const cp   = ca.reduce((s, a) => s + a.pct, 0);
          const ct   = ca.reduce((s, a) => s + a.target, 0);
          const c    = CAT_COLORS[cat];
          const over = cp > ct + 1;
          return (
            <div key={cat} className="cat-card">
              <div className="cat-orb" style={{ background:c }}/>
              <div className="cat-header">
                <Icon name={CAT_ICONS[cat] || "barChart"} style={{ color:c, width:15, height:15 }}/>
                <div className="cat-l">{cat}</div>
              </div>
              <div className="cat-v mono" style={{ color: over ? "var(--accent-amber)" : c }}>{cp.toFixed(1)}%</div>
              <div className="cat-t">Target: {ct.toFixed(1)}%</div>
              <div className="cat-bar">
                <div className="cat-bar-f" style={{ width:`${Math.min(ct > 0 ? (cp / ct) * 100 : 0, 130)}%`, background: over ? "var(--accent-amber)" : c }}/>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live value editor */}
      <div className="editor-panel">
        <button className="editor-hdr" onClick={() => setEditOpen(v => !v)} aria-expanded={editOpen}>
          <div className="editor-hdr-l">
            <Icon name="edit" style={{ width:15, height:15, color:"var(--accent-indigo)" }}/>
            <span className="editor-hdr-title">Update Holdings</span>
            <span className="editor-hint">Enter your real {PLATFORMS.find(p => p.id === platformId)?.name ?? "brokerage"} values after each session</span>
          </div>
          <div className={`chevron ${editOpen ? "open" : ""}`} aria-hidden="true">▾</div>
        </button>
        {editOpen && (
          <div className="editor-body">
            <div className="editor-grid">
              {assets.map(a => {
                const c = CAT_COLORS[a.cat] || "#6366f1";
                return (
                  <div key={a.ticker} className="editor-row">
                    <div className="editor-asset">
                      <div className="d-icon" style={{ background:`${c}18`, color:c, width:28, height:28, borderRadius:7 }}><Icon name={a.icon}/></div>
                      <div>
                        <div className="editor-ticker">{a.ticker}</div>
                        <div className="editor-cat">{a.cat}</div>
                      </div>
                    </div>
                    <div className="editor-inp-wrap">
                      <span className="editor-sym">{cy}</span>
                      <input
                        className="editor-inp mono"
                        type="number" min="0" max="10000000" step="0.01"
                        value={localVals[a.ticker] ?? String(a.current)}
                        onChange={e => setLocalVals(v => ({ ...v, [a.ticker]: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") { onUpdateCurrent(a.ticker, localVals[a.ticker]); e.currentTarget.blur(); }}}
                        aria-label={`Current value for ${a.ticker}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="editor-footer">
              <span className="editor-total">
                <Icon name="sigma" style={{ width:13, height:13, opacity:0.5 }}/>
                Total: <strong className="mono">{cy}{Math.round(computedTotal).toLocaleString()}</strong>
              </span>
              <button className="btn-primary sm" onClick={handleSaveAll}>
                <Icon name="check" style={{ width:13, height:13 }}/>Save All
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── MONTH TAB ────────────────────────────────────────────────
function MonthTab({ step, allSteps, stepIndex, label, isFirst, dca, cy, onConfirmLock, assets, total, showToast }) {
  const [copied, setCopied]       = useState(false);
  const [whatIfDca, setWhatIfDca] = useState(dca);
  const [showWhatIf, setShowWhatIf] = useState(false);

  // Recompute what-if buys when slider changes
  const whatIfBuys = useMemo(
    () => allocate(step.port, step.total, whatIfDca),
    [step.port, step.total, whatIfDca]
  );
  const activeBuys  = showWhatIf ? whatIfBuys : step.buys;
  const activeDca   = showWhatIf ? whatIfDca : dca;
  const spent = activeBuys.reduce((s, b) => s + b.buy, 0);

  const afterEnriched = useMemo(() => {
    const nextPort = step.port.map(a => {
      const b = activeBuys.find(x => x.ticker === a.ticker);
      return b ? { ...a, current: a.current + b.buy } : a;
    });
    return enrich(nextPort, step.total + activeDca).sort((a, b) => b.current - a.current);
  }, [step, activeBuys, activeDca]);

  function doCopy() {
    const lines = activeBuys.map(b => `${b.ticker}: ${cy}${b.buy} (${((b.buy / activeDca) * 100).toFixed(0)}%)`);
    const text  = [`=== ${label} — DCA ${cy}${activeDca} ===`, ...lines, `Total: ${cy}${spent}`].join("\n");
    copyToClipboard(text)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2200); showToast("Instructions copied!"); })
      .catch(() => showToast("Clipboard unavailable — try selecting text manually.", "error"));
  }

  return (
    <>
      <div className="month-header-row">
        <Sh title={`${label} — Buy Instructions`} subtitle={`Portfolio: ${cy}${Math.round(step.total).toLocaleString()} · Deploying ${cy}${activeDca} DCA`}/>
        <div className="month-actions">
          <button className="btn-ghost sm" onClick={() => setShowWhatIf(v => !v)} title="Simulate a different DCA amount">
            <Icon name="sliders" style={{ width:12, height:12 }}/>{showWhatIf ? "Hide What-If" : "What-If"}
          </button>
          <button className="btn-ghost sm" onClick={doCopy} aria-label="Copy trade instructions">
            <Icon name={copied ? "check" : "copy"} style={{ width:12, height:12 }}/>{copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {showWhatIf && (
        <div className="whatif-panel">
          <div className="whatif-label">
            <Icon name="zap" style={{ width:13, height:13, color:"var(--accent-amber)" }}/>
            <span>What if DCA = <strong className="mono">{cy}{whatIfDca}</strong>?</span>
          </div>
          <input
            type="range" min="50" max={Math.max(dca * 5, 500)} step="10"
            value={whatIfDca}
            onChange={e => setWhatIfDca(Number(e.target.value))}
            className="whatif-slider"
            aria-label="What-if DCA amount"
          />
          <div className="whatif-range">
            <span className="mono">{cy}50</span>
            <span className="mono">{cy}{Math.max(dca * 5, 500)}</span>
          </div>
        </div>
      )}

      {activeBuys.length === 0 ? (
        <div className="empty-state">
          <Icon name="circleCheck" style={{ width:40, height:40, color:"var(--accent-green)", marginBottom:12 }}/>
          <p>All assets are at or above target. No buys needed this month!</p>
        </div>
      ) : (
        <div className="buy-list">
          {activeBuys.map((b, i) => {
            const c   = CAT_COLORS[b.cat] || "#6366f1";
            const pct = (b.buy / activeDca) * 100;
            return (
              <div key={b.ticker} className="buy-card" style={{ animation:`slideIn 0.4s ease ${i * 0.05}s both` }}>
                <div className="buy-l">
                  <div className="buy-ico" style={{ background:`${c}18`, color:c }}>
                    <Icon name={b.icon}/>
                  </div>
                  <div className="buy-info">
                    <div className="buy-name-row">
                      <span className="buy-name">{b.name}</span>
                      <span className="badge" style={{ background:`${c}18`, color:c }}>{b.ticker}</span>
                    </div>
                    <div className="buy-meta">
                      <span className="buy-reason">Gap: {cy}{Math.round(b.gap)}</span>
                      <span className="buy-reason-sep">·</span>
                      <span className="buy-reason">{b.pct.toFixed(1)}% now → {b.target.toFixed(1)}% target</span>
                    </div>
                  </div>
                </div>
                <div className="buy-r">
                  <div className="buy-amt mono">{cy}{b.buy}</div>
                  <div className="buy-pct">{pct.toFixed(0)}% of DCA</div>
                  <div className="buy-mini">
                    <div className="buy-mini-f" style={{ width:`${pct}%`, background:c, animationDelay:`${i * 0.08}s` }}/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="total-bar">
        <span className="total-l">
          <Icon name="sigma" style={{ width:14, height:14, marginRight:6, opacity:0.7 }}/>
          Total Deployed
        </span>
        <span className="total-v mono">{cy}{spent} / {cy}{activeDca}</span>
      </div>

      {/* After-buy preview */}
      <Sh title={`After ${label}`} subtitle="Projected holdings after executing these buys"/>
      <div className="after-grid">
        {afterEnriched.map(a => {
          const c      = CAT_COLORS[a.cat] || "#6366f1";
          const bought = activeBuys.find(b => b.ticker === a.ticker);
          return (
            <div key={a.ticker} className={`after-row ${bought ? "after-row-bought" : ""}`}>
              <div className="d-icon sm" style={{ background:`${c}18`, color:c, flexShrink:0 }}><Icon name={a.icon}/></div>
              <div className="after-info">
                <span className="after-ticker">{a.ticker}</span>
                {bought && <span className="after-badge">+{cy}{bought.buy}</span>}
              </div>
              <div className="after-right">
                <span className="after-val mono">{cy}{Math.round(a.current).toLocaleString()}</span>
                <span className="after-pct" style={{ color: Math.abs(a.drift) < 1 ? "var(--accent-green)" : Math.abs(a.drift) < 2.5 ? "var(--accent-amber)" : "var(--accent-red)" }}>
                  {a.pct.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {isFirst && (
        <div className="close-month-section">
          <div className="close-month-info">
            <Icon name="lock" style={{ width:16, height:16, color:"var(--accent-green)", flexShrink:0 }}/>
            <div>
              <div className="close-month-title">Done buying this month?</div>
              <div className="close-month-sub">Lock in to apply buys to your portfolio and save a history snapshot.</div>
            </div>
          </div>
          <button className="btn-primary" onClick={onConfirmLock}>
            <Icon name="check" style={{ width:14, height:14 }}/>
            Lock In Month
          </button>
        </div>
      )}
    </>
  );
}

// ─── HEALTH TAB ───────────────────────────────────────────────
function HealthTab({ finalPort, finalTotal, avgDrift, maxDrift, aligned, cy, months }) {
  const sorted = useMemo(() => [...finalPort].sort((a, b) => Math.abs(a.drift) - Math.abs(b.drift)), [finalPort]);
  return (
    <>
      <Sh title={`${months}-Month Projection`} subtitle={`Projected health after ${months} DCA contributions · ${cy}${Math.round(finalTotal).toLocaleString()} total`}/>
      <div className="h-kpis">
        {[
          { l:"Aligned",   v:`${aligned}/${finalPort.length}`, c:"var(--accent-green)",  d:"Within ±1% of target", icon:"circleCheck" },
          { l:"Avg Drift", v:`${avgDrift.toFixed(2)}%`,        c:"var(--accent-indigo)", d:"Absolute average",     icon:"arrows"      },
          { l:"Max Drift", v:`${maxDrift.toFixed(1)}%`,        c: maxDrift<2 ? "var(--accent-green)" : maxDrift<4 ? "var(--accent-amber)" : "var(--accent-red)", d:"Largest single gap", icon:"warning" },
        ].map((s, i) => (
          <div key={i} className="h-kpi">
            <Icon name={s.icon} style={{ color:s.c, width:22, height:22, marginBottom:10 }}/>
            <div className="h-kpi-l">{s.l}</div>
            <div className="h-kpi-v mono" style={{ color:s.c }}>{s.v}</div>
            <div className="h-kpi-d">{s.d}</div>
          </div>
        ))}
      </div>

      <div className="h-grid">
        {sorted.map((a, i) => {
          const ad = Math.abs(a.drift);
          const h  = ad < 0.5
            ? { l:"Perfect",    c:"var(--accent-green)", bg:"rgba(16,185,129,0.08)", icon:"star"        }
            : ad < 1
            ? { l:"Aligned",    c:"var(--accent-green)", bg:"rgba(16,185,129,0.06)", icon:"circleCheck" }
            : ad < 2.5
            ? { l:"Close",      c:"var(--accent-amber)", bg:"rgba(245,158,11,0.06)", icon:"halfCircle"  }
            : { l:"Needs Work", c:"var(--accent-red)",   bg:"rgba(239,68,68,0.06)",  icon:"warning"     };
          const c = CAT_COLORS[a.cat] || "#6366f1";
          return (
            <div key={a.ticker} className="h-card" style={{ animation:`slideIn 0.35s ease ${i * 0.04}s both` }}>
              <div className="h-left">
                <div className="h-ico" style={{ background:`${c}18`, color:c }}><Icon name={a.icon}/></div>
                <div className="h-info">
                  <div className="h-name">{a.name}</div>
                  <div className="h-meta">{cy}{Math.round(a.current).toLocaleString()} · {a.pct.toFixed(1)}%</div>
                </div>
              </div>
              <div className="h-right">
                <span className="badge" style={{ background:h.bg, color:h.c }}>
                  <Icon name={h.icon} style={{ width:10, height:10 }}/>{h.l}
                </span>
                <div className="h-drift mono" style={{ color: a.drift > 0 ? "var(--accent-amber)" : a.drift < -0.5 ? "var(--accent-blue)" : "var(--text3)" }}>
                  {a.drift >= 0 ? "+" : ""}{a.drift.toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="note">
        <Icon name="info" style={{ color:"var(--accent-indigo)", width:15, height:15, flexShrink:0, marginTop:1 }}/>
        <span><strong>Note:</strong> Projections assume flat asset prices. Re-run after significant market movement. Full convergence typically takes 6–12 months at current DCA rate.</span>
      </div>
    </>
  );
}

// ─── HISTORY TAB ──────────────────────────────────────────────
function HistoryTab({ history, cy }) {
  if (history.length === 0) {
    return (
      <div className="empty-state" style={{ marginTop:56 }}>
        <Icon name="history" style={{ width:44, height:44, color:"var(--text3)", marginBottom:14 }}/>
        <p>No history yet.<br/>Complete a month using <strong>Lock In Month</strong> to start tracking.</p>
      </div>
    );
  }

  // Build sparkline values
  const totals = history.map(h => h.total);
  const minT   = Math.min(...totals);
  const maxT   = Math.max(...totals);

  return (
    <>
      <Sh title="Monthly History" subtitle={`${history.length} month${history.length !== 1 ? "s" : ""} tracked`}/>

      {history.length >= 2 && (
        <div className="sparkline-card">
          <div className="spark-label">Portfolio Value Trend</div>
          <svg className="sparkline" viewBox={`0 0 ${history.length * 40} 60`} preserveAspectRatio="none" aria-label="Portfolio value trend">
            <polyline
              fill="none"
              stroke="var(--accent-green)"
              strokeWidth="2"
              strokeLinejoin="round"
              points={totals.map((t, i) => {
                const x = i * 40 + 10;
                const y = maxT === minT ? 30 : 55 - ((t - minT) / (maxT - minT)) * 50;
                return `${x},${y}`;
              }).join(" ")}
            />
            {totals.map((t, i) => {
              const x = i * 40 + 10;
              const y = maxT === minT ? 30 : 55 - ((t - minT) / (maxT - minT)) * 50;
              return <circle key={i} cx={x} cy={y} r="3" fill="var(--accent-green)"/>;
            })}
          </svg>
          <div className="spark-range">
            <span className="mono">{cy}{Math.round(minT).toLocaleString()}</span>
            <span className="mono">{cy}{Math.round(maxT).toLocaleString()}</span>
          </div>
        </div>
      )}

      <div className="hist-list">
        {[...history].reverse().map((h, i) => {
          const origIdx = history.length - 1 - i;
          const prevTot = origIdx > 0 ? history[origIdx - 1].total : null;
          const gain    = prevTot != null ? h.total - prevTot : null;
          const date    = new Date(h.completedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });
          return (
            <div key={i} className="hist-card">
              <div className="hist-top">
                <div className="hist-label">{h.label}</div>
                <div className="hist-meta">
                  {gain !== null && (
                    <span className="hist-gain" style={{ color: gain >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                      {gain >= 0 ? "+" : ""}{cy}{Math.round(gain).toLocaleString()}
                    </span>
                  )}
                  <span className="hist-date mono">{date}</span>
                </div>
              </div>
              <div className="hist-total mono">{cy}{Math.round(h.total).toLocaleString()}</div>
              {h.note && (
                <div className="hist-note">
                  <Icon name="note" style={{ width:12, height:12, opacity:0.6 }}/>
                  {h.note}
                </div>
              )}
              <div className="hist-assets">
                {h.assets.map(a => {
                  const c      = CAT_COLORS[a.cat] || "#6366f1";
                  const bought = h.buys?.find(x => x.ticker === a.ticker);
                  return (
                    <div key={a.ticker} className={`hist-asset ${bought ? "hist-asset-bought" : ""}`}>
                      <div className="d-icon sm" style={{ background:`${c}18`, color:c }}><Icon name={a.icon}/></div>
                      <span className="hist-ticker">{a.ticker}</span>
                      <span className="hist-val mono">{cy}{Math.round(a.current).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── SETTINGS MODAL ───────────────────────────────────────────
function SettingsModal({ state, onClose, onUpdateDca, onUpdateCurrency, onUpdateTheme, onUpdateProjection, onUpdatePlatform, onUpdateAsset, onAddAsset, onRemoveAsset, onNormalize, onExportJSON, onExportCSV, onImport, onReset, targetSum, targetOk, showToast, total }) {
  const [section, setSection] = useState("general");
  const [localDca, setLocalDca] = useState(String(state.dca));
  const modalRef = useRef(null);
  useEffect(() => { modalRef.current?.focus(); }, []);

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Settings">
      <div className="modal lg-modal" ref={modalRef} tabIndex={-1} onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            <Icon name="close" style={{ width:15, height:15 }}/>
          </button>
        </div>

        <div className="modal-tabs" role="tablist">
          {["general", "assets", "data"].map(s => (
            <button key={s} role="tab" aria-selected={section === s}
              className={`modal-tab ${section === s ? "active" : ""}`}
              onClick={() => setSection(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {section === "general" && (
          <div className="modal-body">
            <SettingRow title="Monthly DCA" desc="How much you invest each month">
              <div className="editor-inp-wrap">
                <span className="editor-sym">{state.currency}</span>
                <input className="editor-inp mono" type="number" min="1" max="1000000" step="10"
                  value={localDca}
                  onChange={e => setLocalDca(e.target.value)}
                  onBlur={() => { onUpdateDca(localDca); showToast("DCA updated"); }}
                  onKeyDown={e => { if (e.key === "Enter") { onUpdateDca(localDca); e.target.blur(); }}}
                  style={{ width:90 }} aria-label="Monthly DCA"/>
              </div>
            </SettingRow>
            <SettingDivider/>
            <SettingRow title="Currency" desc="Symbol shown throughout the app">
              <div className="seg-ctrl" role="group">
                {CURRENCIES.map(c => (
                  <button key={c} className={`seg-btn ${state.currency === c ? "active" : ""}`}
                    onClick={() => onUpdateCurrency(c)}>{c}</button>
                ))}
              </div>
            </SettingRow>
            <SettingDivider/>
            <SettingRow title="Platform" desc="Your brokerage or trading platform">
              <div className="platform-grid">
                {PLATFORMS.map(p => (
                  <button key={p.id}
                    className={`platform-opt ${state.platform === p.id ? "active" : ""}`}
                    style={{ "--p-color": p.color }}
                    onClick={() => onUpdatePlatform(p.id)}
                    title={p.name}
                    aria-label={p.name}
                    aria-pressed={state.platform === p.id}
                  >
                    <span className="platform-opt-ico" aria-hidden="true">{PLATFORM_ICONS[p.id]}</span>
                    <span className="platform-opt-name">{p.name}</span>
                  </button>
                ))}
              </div>
            </SettingRow>
            <SettingDivider/>
            <SettingRow title="Theme" desc="Auto follows system preference and switches at 07:00 / 20:00">
              <div className="seg-ctrl" role="group">
                {[["auto","Auto","auto"],["light","Light","sun"],["dark","Dark","moon"]].map(([val, label, ico]) => (
                  <button key={val} className={`seg-btn ${state.theme === val ? "active" : ""}`}
                    onClick={() => onUpdateTheme(val)}>
                    <Icon name={ico} style={{ width:12, height:12 }}/>{label}
                  </button>
                ))}
              </div>
            </SettingRow>
            <SettingDivider/>
            <SettingRow title="Projection Horizon" desc={`Simulate the next ${state.projectionMonths} month${state.projectionMonths !== 1 ? "s" : ""} of DCA contributions`}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <input type="range" min="1" max="12" value={state.projectionMonths}
                  onChange={e => onUpdateProjection(e.target.value)}
                  style={{ width:110, accentColor:"var(--accent-indigo)" }}
                  aria-label="Projection months"/>
                <span className="mono" style={{ fontSize:16, fontWeight:700, color:"var(--accent-indigo)", minWidth:32 }}>{state.projectionMonths}</span>
              </div>
            </SettingRow>
            <SettingDivider/>
            <SettingRow title="Target Sum" desc="All target allocations must sum to exactly 100%">
              <div className={`target-sum mono ${targetOk ? "ok" : "err"}`}>
                {targetSum.toFixed(2)}%
                <Icon name={targetOk ? "circleCheck" : "warning"} style={{ width:14, height:14, marginLeft:6 }}/>
              </div>
            </SettingRow>
            <SettingDivider/>
            <SettingRow title="Reset Portfolio" desc="Clear all data and restore sample defaults">
              <button className="btn-danger sm" onClick={onReset}>
                <Icon name="trash" style={{ width:13, height:13 }}/>Reset
              </button>
            </SettingRow>
          </div>
        )}

        {section === "assets" && (
          <div className="modal-body">
            <div className="assets-toolbar">
              {!targetOk && (
                <div className="banner banner-warn" style={{ margin:0, flex:1, padding:"8px 12px" }}>
                  <Icon name="warning" style={{ width:14, height:14, flexShrink:0 }}/>
                  <span>Targets sum to {targetSum.toFixed(2)}% — must equal 100%</span>
                </div>
              )}
              <button className="btn-ghost sm" onClick={onNormalize}>
                <Icon name="normalize" style={{ width:13, height:13 }}/>Normalise to 100%
              </button>
            </div>
            <div className="assets-table" role="table">
              <div className="assets-thead" role="row">
                <span>Asset</span><span>Category</span><span>Current</span><span>Target %</span><span/>
              </div>
              {state.assets.map(a => (
                <AssetRow key={a.ticker} asset={a}
                  color={CAT_COLORS[a.cat] || "#6366f1"}
                  currency={state.currency}
                  onUpdate={(field, val) => onUpdateAsset(a.ticker, field, val)}
                  onRemove={() => onRemoveAsset(a.ticker)}
                />
              ))}
            </div>
            <button className="btn-ghost add-btn" onClick={() => { onAddAsset(); showToast("Asset added — edit its values above."); }}>
              <Icon name="addAsset" style={{ width:15, height:15 }}/>Add Asset
            </button>
          </div>
        )}

        {section === "data" && (
          <div className="modal-body">
            <p className="data-intro">All data is stored locally in your browser. <strong>Export regularly</strong> to avoid losing your history.</p>
            <SettingRow title="Export JSON Backup" desc="Full backup — restores everything including history">
              <button className="btn-ghost" onClick={onExportJSON}>
                <Icon name="download" style={{ width:14, height:14 }}/>Export JSON
              </button>
            </SettingRow>
            <SettingDivider/>
            <SettingRow title="Export CSV" desc="Current holdings for spreadsheet analysis">
              <button className="btn-ghost" onClick={onExportCSV}>
                <Icon name="download" style={{ width:14, height:14 }}/>Export CSV
              </button>
            </SettingRow>
            <SettingDivider/>
            <SettingRow title="Import Backup" desc="Restore from a previously exported JSON file (v2 or v3)">
              <button className="btn-ghost" onClick={onImport}>
                <Icon name="upload" style={{ width:14, height:14 }}/>Import JSON
              </button>
            </SettingRow>
            <SettingDivider/>
            <div className="data-stats">
              {[
                ["Assets",          state.assets.length],
                ["History entries", state.history.length],
                ["Schema version",  `v${SCHEMA_VERSION}`],
                ["Storage used",    `${(JSON.stringify(state).length / 1024).toFixed(1)} KB`],
              ].map(([label, val]) => (
                <div key={label} className="data-stat-row">
                  <span>{label}</span>
                  <span className="mono">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ASSET ROW (controlled) ───────────────────────────────────
function AssetRow({ asset, color, currency, onUpdate, onRemove }) {
  const [v, setV] = useState({ ticker: asset.ticker, name: asset.name, current: String(asset.current), target: String(asset.target) });
  const flush = (field) => onUpdate(field, v[field]);
  return (
    <div className="assets-trow" role="row">
      <div className="asset-name-cell">
        <div className="d-icon sm" style={{ background:`${color}18`, color }}><Icon name={asset.icon}/></div>
        <div>
          <input className="asset-text-inp" value={v.ticker}
            onChange={e => setV(x => ({ ...x, ticker: e.target.value }))}
            onBlur={() => flush("ticker")}
            style={{ fontWeight:700, fontSize:12, width:54 }} aria-label="Ticker"/>
          <input className="asset-text-inp" value={v.name}
            onChange={e => setV(x => ({ ...x, name: e.target.value }))}
            onBlur={() => flush("name")}
            style={{ fontSize:11, color:"var(--text3)", width:90 }} aria-label="Name"/>
        </div>
      </div>
      <select className="asset-select" value={asset.cat}
        onChange={e => onUpdate("cat", e.target.value)} aria-label="Category">
        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
      </select>
      <div className="editor-inp-wrap sm">
        <span className="editor-sym">{currency}</span>
        <input className="editor-inp mono" type="number" min="0" max="10000000" step="0.01"
          value={v.current}
          onChange={e => setV(x => ({ ...x, current: e.target.value }))}
          onBlur={() => flush("current")}
          style={{ width:72 }} aria-label="Current value"/>
      </div>
      <div className="editor-inp-wrap sm">
        <input className="editor-inp mono" type="number" min="0" max="100" step="0.01"
          value={v.target}
          onChange={e => setV(x => ({ ...x, target: e.target.value }))}
          onBlur={() => flush("target")}
          style={{ width:56 }} aria-label="Target %"/>
        <span className="editor-sym">%</span>
      </div>
      <button className="icon-btn danger-hover" onClick={onRemove} aria-label={`Remove ${asset.ticker}`}>
        <Icon name="close" style={{ width:12, height:12 }}/>
      </button>
    </div>
  );
}

// ─── CONFIRM MODAL ────────────────────────────────────────────
function ConfirmModal({ icon, iconColor, title, body, confirmLabel, danger, onCancel, onConfirm, hasNote }) {
  const [note, setNote] = useState("");
  return (
    <div className="overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="modal sm-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-icon-wrap" style={{ background: danger ? "rgba(239,68,68,.1)" : "rgba(16,185,129,.1)" }}>
          <Icon name={icon} style={{ width:24, height:24, color:iconColor }}/>
        </div>
        <h3>{title}</h3>
        <p>{body}</p>
        {hasNote && (
          <textarea
            className="note-input"
            placeholder="Add a note for your records (optional)..."
            value={note}
            onChange={e => setNote(e.target.value.slice(0, 500))}
            rows={2}
            aria-label="Optional note"
          />
        )}
        <div className="modal-btns">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={danger ? "btn-danger" : "btn-primary"} onClick={() => onConfirm(note)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── HELPERS ──────────────────────────────────────────────────
function Sh({ title, subtitle }) {
  return (
    <div className="sh">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}
function SettingRow({ title, desc, children }) {
  return (
    <div className="setting-row">
      <div className="setting-label">
        <div className="setting-title">{title}</div>
        {desc && <div className="setting-desc">{desc}</div>}
      </div>
      <div className="setting-ctrl">{children}</div>
    </div>
  );
}
function SettingDivider() { return <div className="setting-divider"/>; }

// ─── CSS ──────────────────────────────────────────────────────
function getCSS() { return `
/* ── THEME TOKENS ── */
.pr.dark, :root {
  --bg:            #0a0f1a;
  --bg2:           #101829;
  --bg3:           #0d1520;
  --surface:       rgba(255,255,255,.03);
  --surface2:      rgba(255,255,255,.06);
  --surface3:      rgba(255,255,255,.09);
  --border:        rgba(255,255,255,.07);
  --border2:       rgba(255,255,255,.13);
  --text:          #e2e8f0;
  --text2:         #94a3b8;
  --text3:         #64748b;
  --text4:         #475569;
  --accent-indigo: #a5b4fc;
  --accent-green:  #10b981;
  --accent-amber:  #f59e0b;
  --accent-red:    #ef4444;
  --accent-blue:   #60a5fa;
  --glow1:         rgba(99,102,241,.07);
  --glow2:         rgba(16,185,129,.05);
  --input-bg:      rgba(255,255,255,.06);
  --kpi-active:    rgba(99,102,241,.14);
}
.pr.light {
  --bg:            #f8fafc;
  --bg2:           #f1f5f9;
  --bg3:           #e8eef5;
  --surface:       rgba(0,0,0,.02);
  --surface2:      rgba(0,0,0,.04);
  --surface3:      rgba(0,0,0,.07);
  --border:        rgba(0,0,0,.09);
  --border2:       rgba(0,0,0,.16);
  --text:          #0f172a;
  --text2:         #334155;
  --text3:         #64748b;
  --text4:         #94a3b8;
  --accent-indigo: #4f46e5;
  --accent-green:  #059669;
  --accent-amber:  #d97706;
  --accent-red:    #dc2626;
  --accent-blue:   #2563eb;
  --glow1:         rgba(99,102,241,.04);
  --glow2:         rgba(16,185,129,.03);
  --input-bg:      rgba(0,0,0,.04);
  --kpi-active:    rgba(79,70,229,.09);
}

/* ── BASE ── */
*, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
.pr { min-height:100vh; background:linear-gradient(165deg,var(--bg) 0%,var(--bg2) 40%,var(--bg3) 100%); font-family:'DM Sans',-apple-system,sans-serif; color:var(--text); overflow-x:hidden; -webkit-font-smoothing:antialiased; transition:background .35s,color .35s; font-size:15px; }
.mono { font-family:'JetBrains Mono',monospace; }
.pr-glow { position:fixed; border-radius:50%; pointer-events:none; z-index:0; }
.g1 { top:-200px; right:-200px; width:500px; height:500px; background:radial-gradient(circle,var(--glow1) 0%,transparent 70%); }
.g2 { bottom:-250px; left:-100px; width:450px; height:450px; background:radial-gradient(circle,var(--glow2) 0%,transparent 70%); }
.wrap { max-width:1100px; margin:0 auto; padding:44px 28px 100px; position:relative; z-index:1; }

/* ── ICONS ── */
.svg-icon { display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; line-height:1; }
.svg-icon svg { width:100%; height:100%; display:block; }
.d-icon .svg-icon { width:15px; height:15px; }
.d-icon.sm .svg-icon { width:13px; height:13px; }
.buy-ico .svg-icon { width:19px; height:19px; }
.h-ico .svg-icon { width:17px; height:17px; }
.tab-ico { width:13px; height:13px; opacity:.8; }
.safety-ico { width:22px; height:22px; flex-shrink:0; }
.badge .svg-icon { width:10px; height:10px; }

/* ── TOAST ── */
.toast { position:fixed; bottom:28px; left:50%; transform:translateX(-50%); background:var(--bg2); border:1px solid var(--border2); border-radius:12px; padding:12px 20px; font-size:14px; font-weight:500; display:flex; align-items:center; gap:9px; z-index:9999; box-shadow:0 8px 32px rgba(0,0,0,.25); animation:toastIn .3s ease; white-space:nowrap; color:var(--text); }
.toast-success { border-color:rgba(16,185,129,.35); color:var(--accent-green); }
.toast-info    { border-color:rgba(99,102,241,.35); color:var(--accent-indigo); }
.toast-error   { border-color:rgba(239,68,68,.35);  color:var(--accent-red); }
@keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(14px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }

/* ── HEADER ── */
.hdr { margin-bottom:32px; opacity:0; transform:translateY(-16px); transition:opacity .7s cubic-bezier(.16,1,.3,1),transform .7s cubic-bezier(.16,1,.3,1); }
.hdr.in { opacity:1; transform:translateY(0); }
.hdr-top { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.hdr-left { flex:1; min-width:0; }
.hdr-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
.dot { width:9px; height:9px; border-radius:50%; background:var(--accent-green); box-shadow:0 0 12px rgba(16,185,129,.65); animation:pulse 2s ease-in-out infinite; flex-shrink:0; }
.hdr-tag { font-size:11px; font-weight:700; letter-spacing:2.8px; text-transform:uppercase; color:var(--accent-green); }
.hdr-title { font-size:38px; font-weight:700; letter-spacing:-.6px; line-height:1.1; margin:0 0 8px; background:linear-gradient(135deg,var(--text),var(--text2)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.hdr-sub-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.hdr-sub { color:var(--text3); font-size:14px; }
.hdr-sep { color:var(--text4); font-size:14px; }
.hdr-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; margin-top:4px; }

/* ── DCA INLINE EDIT ── */
.dca-pill { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; background:rgba(99,102,241,.1); border:1px solid rgba(99,102,241,.2); border-radius:20px; cursor:pointer; font-size:14px; font-weight:600; color:var(--accent-indigo); transition:all .2s; }
.dca-pill:hover { background:rgba(99,102,241,.18); border-color:rgba(99,102,241,.35); }
.dca-edit-form { display:inline-flex; align-items:center; gap:4px; background:rgba(99,102,241,.1); border:1px solid rgba(99,102,241,.35); border-radius:20px; padding:2px 10px; }
.dca-sym { font-size:14px; color:var(--text3); font-family:'JetBrains Mono',monospace; }
.dca-input { background:transparent; border:none; outline:none; font-size:15px; font-weight:700; color:var(--accent-indigo); width:70px; font-family:'JetBrains Mono',monospace; }
.dca-input::-webkit-inner-spin-button,.dca-input::-webkit-outer-spin-button { opacity:.4; }

/* ── THEME BTN ── */
.theme-btn { display:flex; align-items:center; gap:5px; padding:8px 12px; background:var(--surface); border:1px solid var(--border); border-radius:10px; cursor:pointer; color:var(--text3); font-size:12px; font-weight:600; font-family:inherit; transition:all .2s; }
.theme-btn:hover { background:var(--surface2); color:var(--text); }
.theme-label { display:none; }
@media(min-width:520px){ .theme-label { display:inline; } }

/* ── ICON BTN ── */
.icon-btn { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:9px; cursor:pointer; color:var(--text2); display:flex; align-items:center; justify-content:center; transition:all .2s; flex-shrink:0; }
.icon-btn:hover { background:var(--surface2); color:var(--text); }
.icon-btn.danger-hover:hover { background:rgba(239,68,68,.1); color:var(--accent-red); border-color:rgba(239,68,68,.25); }

/* ── KPI ── */
.kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:18px; opacity:0; transform:translateY(14px); transition:opacity .7s cubic-bezier(.16,1,.3,1) .1s,transform .7s cubic-bezier(.16,1,.3,1) .1s; }
.kpi-grid.in { opacity:1; transform:translateY(0); }
.kpi { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px 16px; transition:all .25s; }
.kpi:hover { background:var(--surface2); border-color:var(--border2); transform:translateY(-1px); }
.kpi-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
.kpi-l { font-size:11px; color:var(--text3); font-weight:600; letter-spacing:1px; text-transform:uppercase; }
.kpi-v { font-size:24px; font-weight:700; letter-spacing:-.5px; line-height:1; }
.kpi-s { font-size:12px; color:var(--text4); margin-top:5px; }

/* ── BANNER ── */
.banner { display:flex; align-items:flex-start; gap:9px; padding:12px 16px; border-radius:11px; font-size:13px; margin-bottom:16px; line-height:1.55; }
.banner-warn { background:rgba(245,158,11,.06); border:1px solid rgba(245,158,11,.22); color:var(--accent-amber); }
.banner strong { color:var(--accent-amber); }

/* ── TABS ── */
.tabs { display:flex; gap:3px; margin-bottom:28px; padding:4px; background:var(--surface); border-radius:14px; border:1px solid var(--border); overflow-x:auto; scrollbar-width:none; }
.tabs::-webkit-scrollbar { display:none; }
.tab { flex:0 0 auto; display:flex; align-items:center; justify-content:center; gap:6px; padding:10px 14px; border:none; border-radius:10px; cursor:pointer; font-size:13px; font-weight:400; font-family:inherit; background:transparent; color:var(--text3); transition:all .25s; border-bottom:2px solid transparent; white-space:nowrap; }
.tab.active { background:var(--kpi-active); color:var(--accent-indigo); font-weight:600; border-bottom-color:var(--accent-indigo); }
.tab:hover:not(.active) { color:var(--text2); background:var(--surface2); }
.tab-short { display:none; }

/* ── CONTENT ── */
.content { animation:fadeSlideIn .4s ease; }
.sh { margin-top:28px; margin-bottom:16px; }
.sh h2 { font-size:18px; font-weight:700; color:var(--text); letter-spacing:-.3px; }
.sh p { font-size:13px; color:var(--text3); margin-top:4px; line-height:1.5; }
.badge { font-size:11px; font-weight:600; padding:3px 9px; border-radius:6px; display:inline-flex; align-items:center; gap:4px; }

/* ── DRIFT ── */
.drift-list { display:flex; flex-direction:column; gap:6px; }
.d-row { display:grid; grid-template-columns:130px 64px 1fr 64px 80px; align-items:center; gap:8px; padding:11px 14px; border-radius:12px; background:var(--surface); border:1px solid var(--border); transition:all .25s; animation:slideIn .4s ease both; }
.d-row:hover { background:var(--surface2); border-color:var(--border2); }
.d-left { display:flex; align-items:center; gap:9px; min-width:0; }
.d-icon { width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.d-icon.sm { width:24px; height:24px; border-radius:6px; }
.d-info { min-width:0; }
.d-ticker { font-size:13px; font-weight:700; color:var(--text); letter-spacing:.2px; }
.d-cat { font-size:11px; color:var(--text4); margin-top:1px; }
.d-val { font-size:13px; color:var(--text2); text-align:right; }
.d-bar-area { position:relative; height:20px; display:flex; align-items:center; }
.d-bar-mid { position:absolute; left:50%; top:3px; bottom:3px; width:1px; background:var(--border2); }
.d-bar { position:absolute; height:12px; border-radius:4px; opacity:.85; animation:growBar .7s ease both; }
.d-bar-neg { background:linear-gradient(90deg,#3b82f6,#60a5fa); }
.d-bar-pos { background:linear-gradient(90deg,#f59e0b,#fbbf24); }
.d-pct { font-size:13px; font-weight:700; text-align:right; }
.d-status { display:flex; align-items:center; gap:6px; justify-content:flex-end; }
.d-pip { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
.d-range { font-size:11px; color:var(--text3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.d-mob-drift { display:none; }

/* ── CATEGORY ── */
.cat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
.cat-card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:17px; position:relative; overflow:hidden; transition:all .25s; }
.cat-card:hover { background:var(--surface2); border-color:var(--border2); }
.cat-orb { position:absolute; top:-22px; right:-22px; width:80px; height:80px; border-radius:50%; opacity:.06; }
.cat-header { display:flex; align-items:center; gap:7px; margin-bottom:9px; }
.cat-l { font-size:11px; color:var(--text3); font-weight:700; letter-spacing:1px; text-transform:uppercase; }
.cat-v { font-size:24px; font-weight:700; line-height:1; }
.cat-t { font-size:12px; color:var(--text4); margin-top:3px; }
.cat-bar { margin-top:12px; height:5px; border-radius:3px; background:var(--surface2); overflow:hidden; }
.cat-bar-f { height:100%; border-radius:3px; transition:width 1s ease; }

/* ── SAFETY ── */
.safety { margin-top:22px; padding:15px 18px; border-radius:14px; background:rgba(16,185,129,.06); border:1px solid rgba(16,185,129,.18); display:flex; align-items:flex-start; gap:12px; }
.safety-warn { background:rgba(239,68,68,.06); border-color:rgba(239,68,68,.2); }
.safety-t { font-size:14px; font-weight:700; color:var(--accent-green); }
.safety-d { font-size:13px; color:var(--text3); margin-top:3px; line-height:1.55; }

/* ── MONTH ── */
.month-header-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.month-actions { display:flex; gap:8px; flex-shrink:0; margin-top:26px; }
.buy-list { display:flex; flex-direction:column; gap:8px; }
.buy-card { display:flex; align-items:center; justify-content:space-between; padding:15px 18px; border-radius:14px; background:var(--surface); border:1px solid var(--border); transition:all .25s; gap:14px; }
.buy-card:hover { background:var(--surface2); border-color:var(--border2); }
.buy-l { display:flex; align-items:center; gap:14px; min-width:0; flex:1; }
.buy-ico { width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.buy-info { min-width:0; flex:1; }
.buy-name-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.buy-name { font-size:15px; font-weight:700; color:var(--text); }
.buy-meta { display:flex; align-items:center; gap:5px; margin-top:4px; flex-wrap:wrap; }
.buy-reason { font-size:12px; color:var(--text3); }
.buy-reason-sep { font-size:12px; color:var(--text4); }
.buy-r { text-align:right; flex-shrink:0; }
.buy-amt { font-size:22px; font-weight:700; color:var(--text); line-height:1; }
.buy-pct { font-size:12px; color:var(--text3); margin-top:3px; }
.buy-mini { margin-top:6px; width:68px; height:4px; border-radius:2px; background:var(--surface2); margin-left:auto; }
.buy-mini-f { height:100%; border-radius:2px; animation:growBar .8s ease both; }
.total-bar { margin-top:12px; padding:13px 18px; border-radius:12px; background:linear-gradient(135deg,rgba(99,102,241,.07),rgba(16,185,129,.05)); border:1px solid rgba(99,102,241,.14); display:flex; justify-content:space-between; align-items:center; }
.total-l { font-size:14px; font-weight:600; color:var(--accent-indigo); display:flex; align-items:center; }
.total-v { font-size:18px; font-weight:700; color:var(--text); }

/* ── WHAT-IF PANEL ── */
.whatif-panel { margin:10px 0 16px; padding:14px 18px; border-radius:12px; background:rgba(245,158,11,.05); border:1px solid rgba(245,158,11,.18); }
.whatif-label { display:flex; align-items:center; gap:7px; font-size:14px; color:var(--text2); margin-bottom:10px; }
.whatif-slider { width:100%; accent-color:var(--accent-amber); cursor:pointer; }
.whatif-range { display:flex; justify-content:space-between; font-size:12px; color:var(--text4); margin-top:5px; }

/* ── AFTER-BUY ── */
.after-grid { display:flex; flex-direction:column; gap:6px; }
.after-row { display:flex; align-items:center; gap:11px; padding:9px 14px; border-radius:10px; background:var(--surface); border:1px solid var(--border); transition:border-color .2s; }
.after-row-bought { border-color:rgba(16,185,129,.22); background:rgba(16,185,129,.03); }
.after-info { flex:1; display:flex; align-items:center; gap:8px; }
.after-ticker { font-size:13px; font-weight:700; color:var(--text); }
.after-badge { font-size:11px; font-weight:700; color:var(--accent-green); background:rgba(16,185,129,.14); padding:2px 7px; border-radius:5px; }
.after-right { display:flex; flex-direction:column; align-items:flex-end; gap:2px; flex-shrink:0; }
.after-val { font-size:13px; font-weight:600; color:var(--text); }
.after-pct { font-size:12px; font-weight:700; }

/* ── LOCK MONTH ── */
.close-month-section { margin-top:28px; padding:18px 20px; border-radius:16px; background:rgba(16,185,129,.05); border:1px solid rgba(16,185,129,.22); display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.close-month-info { display:flex; align-items:flex-start; gap:11px; }
.close-month-title { font-size:15px; font-weight:700; color:var(--accent-green); }
.close-month-sub { font-size:13px; color:var(--text3); margin-top:4px; line-height:1.5; }

/* ── BUTTONS ── */
.btn-primary { display:inline-flex; align-items:center; gap:7px; padding:11px 20px; background:linear-gradient(135deg,#6366f1,#4f46e5); border:none; border-radius:11px; color:#fff; font-size:14px; font-weight:700; font-family:inherit; cursor:pointer; transition:all .2s; white-space:nowrap; }
.btn-primary:hover { transform:translateY(-1px); box-shadow:0 5px 18px rgba(99,102,241,.4); }
.btn-primary.sm { padding:8px 14px; font-size:13px; }
.btn-ghost { display:inline-flex; align-items:center; gap:6px; padding:9px 16px; background:var(--surface); border:1px solid var(--border2); border-radius:10px; color:var(--text2); font-size:13px; font-weight:500; font-family:inherit; cursor:pointer; transition:all .2s; white-space:nowrap; }
.btn-ghost:hover { background:var(--surface2); color:var(--text); }
.btn-ghost.sm { padding:7px 12px; font-size:12px; }
.btn-ghost.add-btn { margin-top:14px; color:var(--accent-indigo); border-color:rgba(99,102,241,.3); }
.btn-ghost.add-btn:hover { background:rgba(99,102,241,.08); }
.btn-danger { display:inline-flex; align-items:center; gap:7px; padding:9px 16px; background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.28); border-radius:10px; color:var(--accent-red); font-size:13px; font-weight:700; font-family:inherit; cursor:pointer; transition:all .2s; }
.btn-danger:hover { background:rgba(239,68,68,.2); }
.btn-danger.sm { padding:7px 12px; font-size:12px; }

/* ── EDITOR PANEL ── */
.editor-panel { margin-top:32px; border-radius:16px; background:rgba(99,102,241,.04); border:1px solid rgba(99,102,241,.14); overflow:hidden; }
.editor-hdr { width:100%; display:flex; align-items:center; justify-content:space-between; padding:16px 18px; cursor:pointer; background:transparent; border:none; font-family:inherit; color:inherit; transition:background .2s; text-align:left; }
.editor-hdr:hover { background:rgba(99,102,241,.06); }
.editor-hdr-l { display:flex; align-items:center; gap:10px; flex:1; min-width:0; }
.editor-hdr-title { font-size:14px; font-weight:700; color:var(--accent-indigo); }
.editor-hint { font-size:12px; color:var(--text4); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.chevron { font-size:18px; color:var(--accent-indigo); transition:transform .25s; flex-shrink:0; }
.chevron.open { transform:rotate(180deg); }
.editor-body { padding:18px; border-top:1px solid rgba(99,102,241,.12); }
.editor-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:9px; }
.editor-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 14px; border-radius:10px; background:var(--surface); border:1px solid var(--border); transition:border-color .2s; }
.editor-row:focus-within { border-color:rgba(99,102,241,.35); }
.editor-asset { display:flex; align-items:center; gap:9px; }
.editor-ticker { font-size:13px; font-weight:700; color:var(--text); }
.editor-cat { font-size:11px; color:var(--text4); margin-top:1px; }
.editor-inp-wrap { display:flex; align-items:center; background:var(--input-bg); border:1px solid var(--border2); border-radius:8px; overflow:hidden; transition:border-color .2s; }
.editor-inp-wrap:focus-within { border-color:rgba(99,102,241,.5); }
.editor-sym { padding:0 7px; font-size:13px; color:var(--text3); font-family:'JetBrains Mono',monospace; flex-shrink:0; }
.editor-inp { background:transparent; border:none; outline:none; padding:8px 8px 8px 2px; font-size:14px; color:var(--text); width:90px; }
.editor-inp::-webkit-inner-spin-button,.editor-inp::-webkit-outer-spin-button { opacity:.4; }
.editor-footer { display:flex; align-items:center; justify-content:space-between; margin-top:16px; padding-top:14px; border-top:1px solid var(--border); }
.editor-total { display:flex; align-items:center; gap:7px; font-size:14px; color:var(--text3); }
.editor-total strong { color:var(--text); }

/* ── EMPTY STATE ── */
.empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:56px 24px; text-align:center; color:var(--text2); font-size:15px; line-height:1.7; }

/* ── HEALTH ── */
.h-kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:28px; }
.h-kpi { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:22px 16px; text-align:center; display:flex; flex-direction:column; align-items:center; transition:all .25s; }
.h-kpi:hover { background:var(--surface2); }
.h-kpi-l { font-size:11px; color:var(--text3); font-weight:700; letter-spacing:1px; text-transform:uppercase; margin-bottom:7px; }
.h-kpi-v { font-size:30px; font-weight:700; line-height:1; }
.h-kpi-d { font-size:12px; color:var(--text4); margin-top:5px; }
.h-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:9px; }
.h-card { padding:13px 16px; border-radius:13px; background:var(--surface); border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; transition:all .25s; gap:9px; }
.h-card:hover { background:var(--surface2); }
.h-left { display:flex; align-items:center; gap:11px; min-width:0; }
.h-ico { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.h-info { min-width:0; }
.h-name { font-size:13px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.h-meta { font-size:12px; color:var(--text3); margin-top:2px; }
.h-right { text-align:right; flex-shrink:0; }
.h-drift { font-size:13px; font-weight:700; margin-top:4px; }
.note { margin-top:22px; padding:15px 18px; border-radius:13px; background:rgba(99,102,241,.05); border:1px solid rgba(99,102,241,.14); font-size:13px; color:var(--text2); line-height:1.75; display:flex; align-items:flex-start; gap:9px; }
.note strong { color:var(--accent-indigo); }

/* ── HISTORY ── */
.sparkline-card { margin-bottom:20px; padding:16px 20px; background:var(--surface); border:1px solid var(--border); border-radius:14px; }
.spark-label { font-size:12px; font-weight:600; color:var(--text3); text-transform:uppercase; letter-spacing:.8px; margin-bottom:10px; }
.sparkline { width:100%; height:60px; display:block; }
.spark-range { display:flex; justify-content:space-between; font-size:12px; color:var(--text4); margin-top:6px; }
.hist-list { display:flex; flex-direction:column; gap:14px; }
.hist-card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px 20px; transition:border-color .2s; }
.hist-card:hover { border-color:var(--border2); }
.hist-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:5px; }
.hist-label { font-size:15px; font-weight:700; color:var(--text); }
.hist-meta { display:flex; align-items:center; gap:12px; }
.hist-gain { font-size:14px; font-weight:700; }
.hist-date { font-size:12px; color:var(--text4); }
.hist-total { font-size:26px; font-weight:700; color:var(--accent-green); margin-bottom:5px; line-height:1; }
.hist-note { font-size:12px; color:var(--text3); display:flex; align-items:center; gap:6px; margin-bottom:12px; line-height:1.5; }
.hist-assets { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:7px; margin-top:12px; }
.hist-asset { display:flex; align-items:center; gap:7px; padding:6px 9px; border-radius:8px; background:var(--surface2); border:1px solid var(--border); }
.hist-asset-bought { border-color:rgba(16,185,129,.22); background:rgba(16,185,129,.04); }
.hist-ticker { font-size:12px; font-weight:700; color:var(--text2); flex:1; }
.hist-val { font-size:12px; color:var(--text); }

/* ── SETTINGS MODAL ── */
.overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(7px); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px; }
.modal { background:var(--bg2); border:1px solid var(--border2); border-radius:20px; box-shadow:0 28px 90px rgba(0,0,0,.4); overflow:hidden; animation:modalIn .25s ease; width:100%; outline:none; }
.lg-modal { max-width:700px; max-height:86vh; display:flex; flex-direction:column; }
.sm-modal { max-width:400px; padding:32px 28px; text-align:center; }
.sm-modal h3 { font-size:19px; font-weight:700; color:var(--text); margin:14px 0 8px; }
.sm-modal p { font-size:14px; color:var(--text3); line-height:1.65; }
.modal-icon-wrap { width:52px; height:52px; border-radius:16px; display:flex; align-items:center; justify-content:center; margin:0 auto; }
.modal-btns { display:flex; gap:10px; justify-content:center; margin-top:22px; }
.modal-hdr { display:flex; align-items:center; justify-content:space-between; padding:20px 22px; border-bottom:1px solid var(--border); flex-shrink:0; }
.modal-hdr h2 { font-size:17px; font-weight:700; color:var(--text); }
.modal-tabs { display:flex; gap:2px; padding:12px 22px 0; border-bottom:1px solid var(--border); flex-shrink:0; }
.modal-tab { padding:9px 18px; border:none; background:transparent; color:var(--text3); font-size:14px; font-weight:500; font-family:inherit; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; transition:all .2s; }
.modal-tab.active { color:var(--accent-indigo); border-bottom-color:var(--accent-indigo); font-weight:700; }
.modal-body { padding:22px; overflow-y:auto; flex:1; }
.setting-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:10px 0; flex-wrap:wrap; }
.setting-label { flex:1; min-width:0; }
.setting-ctrl { flex-shrink:0; }
.setting-title { font-size:14px; font-weight:700; color:var(--text); }
.setting-desc { font-size:12px; color:var(--text3); margin-top:3px; line-height:1.45; }
.setting-divider { height:1px; background:var(--border); margin:12px 0; }
.target-sum { font-size:15px; font-weight:700; display:flex; align-items:center; }
.target-sum.ok { color:var(--accent-green); }
.target-sum.err { color:var(--accent-red); }

/* ── SEGMENTED CONTROL ── */
.seg-ctrl { display:flex; background:var(--surface2); border-radius:9px; padding:3px; gap:2px; }
.seg-btn { display:flex; align-items:center; gap:5px; padding:6px 13px; border:none; border-radius:7px; background:transparent; color:var(--text3); font-size:13px; font-weight:500; font-family:inherit; cursor:pointer; transition:all .2s; white-space:nowrap; }
.seg-btn.active { background:var(--bg); color:var(--text); box-shadow:0 1px 5px rgba(0,0,0,.18); font-weight:700; }
.seg-btn:hover:not(.active) { color:var(--text2); }

/* ── ASSETS TABLE ── */
.assets-toolbar { display:flex; align-items:center; justify-content:flex-end; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
.assets-table { display:flex; flex-direction:column; gap:7px; }
.assets-thead { display:grid; grid-template-columns:2fr 1fr 1fr 1fr 32px; gap:9px; padding:0 10px 8px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.9px; color:var(--text4); }
.assets-trow { display:grid; grid-template-columns:2fr 1fr 1fr 1fr 32px; gap:9px; align-items:center; padding:10px; border-radius:11px; background:var(--surface); border:1px solid var(--border); transition:border-color .2s; }
.assets-trow:hover { border-color:var(--border2); }
.asset-name-cell { display:flex; align-items:center; gap:9px; min-width:0; }
.asset-text-inp { background:transparent; border:none; outline:none; color:var(--text); font-family:inherit; display:block; line-height:1.35; }
.asset-text-inp:focus { background:rgba(99,102,241,.1); border-radius:4px; padding:1px 5px; }
.asset-select { background:var(--input-bg); border:1px solid var(--border2); border-radius:8px; color:var(--text2); font-size:12px; font-family:inherit; padding:6px 8px; outline:none; cursor:pointer; }
.asset-select:focus { border-color:rgba(99,102,241,.45); }

/* ── DATA SECTION ── */
.data-intro { font-size:13px; color:var(--text3); line-height:1.7; margin-bottom:20px; }
.data-intro strong { color:var(--text2); }
.data-stats { margin-top:16px; padding:16px; background:var(--surface); border:1px solid var(--border); border-radius:12px; display:flex; flex-direction:column; gap:11px; }
.data-stat-row { display:flex; justify-content:space-between; align-items:center; font-size:14px; color:var(--text3); }
.data-stat-row .mono { color:var(--text); font-weight:700; }

/* ── NOTE INPUT ── */
.note-input { width:100%; margin-top:16px; padding:11px 14px; background:var(--surface); border:1px solid var(--border2); border-radius:10px; color:var(--text); font-size:14px; font-family:inherit; outline:none; resize:vertical; min-height:64px; line-height:1.55; transition:border-color .2s; }
.note-input:focus { border-color:rgba(99,102,241,.45); }
.note-input::placeholder { color:var(--text4); }

/* ── ANIMATIONS ── */
@keyframes fadeSlideIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.85)} }
@keyframes growBar { from{width:0!important} }
@keyframes slideIn { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
@keyframes modalIn { from{opacity:0;transform:scale(.96) translateY(14px)} to{opacity:1;transform:scale(1) translateY(0)} }

/* ════════════ TABLET (≤768px) ════════════ */
@media (max-width:768px) {
.wrap { padding:28px 18px 100px; }
.hdr-title { font-size:30px; }
.kpi-grid { grid-template-columns:repeat(2,1fr); gap:10px; }
.kpi-v { font-size:20px; }
.tab { padding:9px 8px; font-size:12px; }
.tab-full { display:none; }
.tab-short { display:inline; font-size:11px; }
.d-row { grid-template-columns:1fr auto auto; grid-template-rows:auto auto; gap:4px 9px; }
.d-bar-area,.d-status { display:none; }
.d-mob-drift { display:flex; align-items:center; gap:8px; grid-column:1/-1; padding-top:5px; }
.d-mob-bar-track { flex:1; height:5px; border-radius:3px; background:var(--surface2); overflow:hidden; }
.d-mob-bar-fill { height:100%; border-radius:3px; animation:growBar .7s ease both; }
.cat-grid { grid-template-columns:repeat(2,1fr); gap:10px; }
.editor-grid { grid-template-columns:1fr; }
.h-grid { grid-template-columns:1fr; }
.h-kpi-v { font-size:24px; }
.assets-thead,.assets-trow { grid-template-columns:2fr 1fr 1fr 36px; }
.assets-thead span:nth-child(4),.assets-trow .editor-inp-wrap:last-of-type { display:none; }
.close-month-section { flex-direction:column; align-items:flex-start; }
.setting-row { flex-direction:column; align-items:flex-start; gap:10px; }
.setting-ctrl { align-self:flex-start; }
}

/* ════════════ MOBILE (≤480px) ════════════ */
@media (max-width:480px) {
.wrap { padding:18px 14px 100px; }
.hdr-title { font-size:24px; }
.hdr-tag { font-size:10px; }
.kpi-grid { gap:8px; }
.kpi { padding:13px 12px; border-radius:12px; }
.kpi-v { font-size:18px; }
.kpi-l { font-size:10px; }
.kpi-s { font-size:11px; }
.tabs { gap:2px; padding:3px; }
.tab { padding:8px 6px; }
.cat-grid { gap:8px; }
.cat-v { font-size:20px; }
.d-ticker { font-size:12px; }
.buy-card { padding:12px 14px; gap:10px; }
.buy-ico { width:36px; height:36px; }
.buy-amt { font-size:19px; }
.buy-name { font-size:14px; }
.h-kpis { gap:8px; }
.h-kpi { padding:16px 10px; }
.h-kpi-v { font-size:22px; }
.h-kpi-l { font-size:10px; }
.safety { padding:13px 14px; }
.note { padding:13px 14px; font-size:12px; }
.total-bar { padding:11px 14px; }
.total-l { font-size:13px; }
.total-v { font-size:16px; }
.editor-row { padding:9px 12px; }
.modal { border-radius:16px; }
.lg-modal { max-height:93vh; }
.sm-modal { padding:24px 20px; }
.sm-modal h3 { font-size:17px; }
.assets-thead,.assets-trow { grid-template-columns:1fr 1fr 36px; }
.assets-thead span:nth-child(2),.assets-trow select { display:none; }
.close-month-section { padding:14px; }
.hist-assets { grid-template-columns:repeat(2,1fr); }
.hist-total { font-size:22px; }
.sparkline-card { padding:12px 14px; }
}

/* ── PLATFORM BADGE ── */
.platform-badge { display:inline-flex; align-items:center; gap:5px; padding:2px 8px 2px 4px; border-radius:20px; background:color-mix(in srgb, var(--p-color) 15%, transparent); color:var(--p-color); font-size:12px; font-weight:600; vertical-align:middle; line-height:1.3; }
.platform-ico { width:16px; height:16px; display:flex; align-items:center; justify-content:center; flex-shrink:0; border-radius:4px; overflow:hidden; }
.platform-ico svg { width:16px; height:16px; display:block; }

/* ── PLATFORM PICKER ── */
.platform-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:8px; width:100%; }
.platform-opt { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:10px; border:1.5px solid var(--border2); background:var(--surface); cursor:pointer; color:var(--text2); font-size:13px; font-weight:500; transition:border-color .15s,background .15s,color .15s; text-align:left; }
.platform-opt:hover { border-color:var(--p-color); color:var(--text); background:color-mix(in srgb, var(--p-color) 8%, var(--surface)); }
.platform-opt.active { border-color:var(--p-color); background:color-mix(in srgb, var(--p-color) 15%, var(--surface)); color:var(--p-color); font-weight:600; }
.platform-opt-ico { width:22px; height:22px; display:flex; align-items:center; justify-content:center; flex-shrink:0; border-radius:5px; overflow:hidden; }
.platform-opt-ico svg { width:22px; height:22px; display:block; }
.platform-opt-name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* ── PRINT ── */
@media print {
.tabs,.editor-panel,.close-month-section,.hdr-actions,.pr-glow,.toast { display:none!important; }
.pr { background:white!important; color:black!important; }
.content { animation:none!important; }
.kpi { border:1px solid #ccc!important; }
}
`; }
