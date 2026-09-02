// Portfolio Roadmap — personal DCA rebalancing engine for a single Trade Republic account (EUR).

import { useState, useEffect, useMemo, useCallback, useRef, Component } from "react";
import { Icon as IconifyIcon } from "@iconify/react";
import { BRAND_ICONS } from "./brandIcons";
import { fetchLiveQuotes, fetchFxRates, buildLiveModel, pushLocalSnapshot, persistSnapshotRemote } from "./services/marketData";
import { importBrokerCsv, importTradeRepublicPdf } from "./services/brokerImport";
import {
  sanitizeNum, sanitizeStr, sanitizeDcaSchedule,
  currentMonthYM, activeDcaFromSchedule, nextDcaFromSchedule, addMonths,
  enrich, allocate, runProjection, freeCash, dcaFromIncome,
  buildMonthlySeries, monthlyContributions, sanitizeHistory, historyEntryPoint,
  seriesIrr, benchmarkSeries, savingsPlanSplit, savingsPlanDrift,
  dividendIncome, US_WITHHOLDING_PCT, reviewStatus,
} from "./engine";
import "./styles.css";

// ─── CONSTANTS ────────────────────────────────────────────────
const SCHEMA_VERSION = 4;
const STORE_KEY      = "portfolio_roadmap_v4";
const LEGACY_STORE_KEY = "portfolio_roadmap_v3";
// This build tracks a single Trade Republic account in EUR — no multi-broker or
// multi-currency selection, by design (see CATEGORIES below for asset classes).
const CURRENCY_SYMBOL = "€";
const CURRENCY_ISO    = "EUR";
const PLATFORM_NAME   = "Trade Republic";
const CATEGORIES     = ["Crypto", "Tech", "Dividend", "ETF", "Bond", "Commodity", "Other"];
const CAT_COLORS     = {
  Crypto: "#FF9800", Tech: "#5C6BC0", Dividend: "#66BB6A",
  ETF: "#42A5F5",   Bond: "#AB47BC", Commodity: "#EC407A", Other: "#78909C",
};
const CAT_ICONS = {
  Crypto: "coins", Tech: "laptop", Dividend: "handDollar",
  ETF: "layers", Bond: "shield", Commodity: "star", Other: "barChart",
};
const OFFICIAL_TICKER_ICONS = {
  BTC: "bitcoin",
  ETH: "ethereum",
  NVDA: "nvidia",
  AAPL: "apple",
  MSFT: "microsoft",
  KO: "coca_cola",
  JNJ: "jnj",
  SPY: "spy",
  CSPX: "spy",
  VWCE: "vwce",
  VHYL: "vhyl",
};
// ─── TICKER ICONS ─────────────────────────────────────────────
// Brand marks come from Iconify data bundled at build time (see scripts/gen-icons.cjs).
// Holdings with no brand mark in the wild (ETFs, J&J) get a designed lettermark rather
// than a binary image — that removes the whole class of "icon silently fails to load"
// bugs we had with the PNGs, and keeps every asset icon crisp at any size.
function Brand({ icon, color }) {
  return <IconifyIcon icon={icon} color={color} width="100%" height="100%" aria-hidden="true"/>;
}

// Keep these to 2-3 glyphs: the icon box is ~20px, so four characters turn to mush.
function LetterMark({ text, color }) {
  const size = text.length >= 3 ? "8.5px" : "11px";
  return (
    <span className="lettermark" style={{ color, fontSize: size }} aria-hidden="true">
      {text}
    </span>
  );
}

// ─── SVG ICON LIBRARY ─────────────────────────────────────────
const Icons = {
  bitcoin:     <Brand icon={BRAND_ICONS.bitcoin}   color="#F7931A"/>,
  ethereum:    <Brand icon={BRAND_ICONS.ethereum}  color="#8A92B2"/>,
  nvidia:      <Brand icon={BRAND_ICONS.nvidia}    color="#76B900"/>,
  apple:       <Brand icon={BRAND_ICONS.apple}     color="#F5F5F7"/>,
  microsoft:   <Brand icon={BRAND_ICONS.microsoft} color="#00A4EF"/>,
  coca_cola:   <Brand icon={BRAND_ICONS.cocacola}  color="#F40009"/>,
  jnj:         <LetterMark text="J&J" color="#FF5470"/>,
  spy:         <LetterMark text="S&P" color="#5AA9FF"/>,
  vwce:        <LetterMark text="VW"  color="#FF7A6B"/>,
  vhyl:        <LetterMark text="VH"  color="#4ADE80"/>,
  microchip:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M7 9H4M7 12H4M7 15H4M17 9h3M17 12h3M17 15h3M9 7V4M12 7V4M15 7V4M9 17v3M12 17v3M15 17v3"/></svg>,
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
  logout:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
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
function PlatformBadge() {
  return <span className="platform-badge">{PLATFORM_NAME}</span>;
}

// ─── HOW-TO DISCLOSURE ────────────────────────────────────────
// Collapsed by default, one per feature. Built on native <details>/<summary> rather than
// useState: it gets keyboard operation, the correct ARIA semantics, and find-in-page
// expansion for free, and it costs no render on the pages that never open it.
function HowTo({ title = "How to read this", children }) {
  return (
    <details className="howto">
      <summary className="howto-sum">
        <Icon name="info" className="howto-ico"/>
        <span className="howto-title">{title}</span>
        <span className="howto-chev" aria-hidden="true">▾</span>
      </summary>
      <div className="howto-body">{children}</div>
    </details>
  );
}

// A short list of numbered steps — "do this, then this".
function HowToSteps({ children }) { return <ol className="howto-steps">{children}</ol>; }

// One highlighted line: the thing that saves you from a wrong reading.
function HowToTip({ children, warn = false }) {
  return (
    <p className={`howto-tip ${warn ? "warn" : ""}`}>
      <Icon name={warn ? "warning" : "zap"} style={{ width:13, height:13, flexShrink:0, marginTop:1 }}/>
      <span>{children}</span>
    </p>
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

// ─── FOCUS TRAP (modals) ───────────────────────────────────────
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';
function useFocusTrap(containerRef, active = true) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const handleKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const focusable = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [containerRef, active]);
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
function sanitizeAsset(a) {
  if (!a || typeof a !== "object") return null;
  const holdings = a.holdings != null ? sanitizeNum(a.holdings, 0, 1_000_000_000, null) : null;
  const current = sanitizeNum(a.current, 0, 10_000_000, 0);
  // costBasis tracks actual money invested. If missing (fresh asset, older backup, or
  // an import that only gives market value), seed it from current value — this means
  // unrealized P&L starts at zero and becomes accurate from here forward via Lock In buys.
  const costBasis = sanitizeNum(a.costBasis, 0, 10_000_000, current);
  return {
    name:    sanitizeStr(a.name || "Asset", 40),
    ticker:  sanitizeStr((a.ticker || "???").toUpperCase(), 10).replace(/[^A-Z0-9.&]/g, "") || "???",
    cat:     CATEGORIES.includes(a.cat) ? a.cat : "Other",
    current,
    target:  sanitizeNum(a.target,  0, 100, 0),
    icon:    typeof a.icon === "string" && Icons[a.icon] ? a.icon : "barChart",
    costBasis,
    // Null, not zero, when never set: zero means "pays nothing" and is a real answer for
    // an accumulating fund, so the dividend view must be able to tell the two apart.
    yieldPct: a.yieldPct != null ? sanitizeNum(a.yieldPct, 0, 100, null) : null,
    ucits:    !!a.ucits,
    ...(holdings != null ? { holdings } : {}),
    ...(typeof a._isin === "string" ? { _isin: a._isin.slice(0, 16) } : {}),
  };
}

// Benchmarks the /api/market/history endpoint will serve. Both are EUR-denominated Irish
// UCITS ETFs, so a euro contribution converts one-to-one — keep that true for anything
// added here, or the comparison silently needs FX handling.
const BENCHMARK_OPTIONS = [
  { key: "VWCE", label: "FTSE All-World (VWCE)" },
  { key: "CSPX", label: "S&P 500 (CSPX)" },
];

// ─── DEFAULT DATA ─────────────────────────────────────────────
// yieldPct is the trailing annual distribution yield, editable per asset — it drives the
// dividend estimate and nothing else. Accumulating ETFs distribute nothing, so 0 is the
// correct value for CSPX and VWCE, not a missing one.
// ucits marks an EU/EEA UCITS fund, whose distributions are exempt for a Greek resident
// while US shares lose 15% at source — see docs/research/2026-09-01-greece-tax-treatment.md.
const DEFAULT_ASSETS = [
  { name:"BTC",            ticker:"BTC",  cat:"Crypto",   current:178,  target:11.5,  icon:"bitcoin",   yieldPct:0,    ucits:false },
  { name:"ETH",            ticker:"ETH",  cat:"Crypto",   current:87,   target:6.0,   icon:"ethereum",  yieldPct:0,    ucits:false },
  { name:"NVIDIA",         ticker:"NVDA", cat:"Tech",     current:163,  target:6.67,  icon:"nvidia",    yieldPct:0.03, ucits:false },
  { name:"Apple",          ticker:"AAPL", cat:"Tech",     current:148,  target:6.67,  icon:"apple",     yieldPct:0.5,  ucits:false },
  { name:"Microsoft",      ticker:"MSFT", cat:"Tech",     current:118,  target:6.67,  icon:"microsoft", yieldPct:0.7,  ucits:false },
  { name:"Coca-Cola",      ticker:"KO",   cat:"Dividend", current:239,  target:8.75,  icon:"coca_cola", yieldPct:2.9,  ucits:false },
  { name:"J&J",            ticker:"JNJ",  cat:"Dividend", current:252,  target:8.75,  icon:"jnj",       yieldPct:3.0,  ucits:false },
  { name:"Core S&P 500",   ticker:"CSPX", cat:"ETF",      current:434,  target:18.0,  icon:"spy",       yieldPct:0,    ucits:true  },
  { name:"FTSE All World", ticker:"VWCE", cat:"ETF",      current:367,  target:15.0,  icon:"vwce",      yieldPct:0,    ucits:true  },
  { name:"Hi Div ETF",     ticker:"VHYL", cat:"ETF",      current:249,  target:12.0,  icon:"vhyl",      yieldPct:3.1,  ucits:true  },
];
const DEFAULT_STATE = {
  schemaVersion: SCHEMA_VERSION,
  assets: DEFAULT_ASSETS.map(a => ({ ...a })),
  dca: 130,
  theme: "auto",
  projectionMonths: 3,
  history: [],
  income: {
    monthlyNet: 0,
    label: "",
    asOf: null,
  },
  dcaSchedule: [],
  dcaAutoAppliedIds: [],
  dcaRule: { enabled: false, pctOfIncome: 10, appliedFor: "" },
  cash: { available: 0, committed: 0, buffer: 0 },
  lastBackupAt: null,
  live: {
    enabled: false,
    refreshSec: 60,
    lastFetchedAt: null,
    providerHealth: {},
    unresolved: [],
  },
  alerts: {
    enabled: true,
    driftThreshold: 5,
  },
  priceSnapshots: [],
  brokerImportLog: [],
  // The fixed per-ticker split currently set up as a Trade Republic savings plan. Stored
  // so the app can tell when the broker's fixed split has fallen out of step with what
  // the gap-weighted allocator would now do.
  savingsPlan: { rows: [], monthly: 0, setAt: null },
  // The plan calls for a periodic review; without a date the app cannot tell you one is due.
  review: { intervalMonths: 3, lastReviewedAt: null },
  // Cached month-end closes for the Analytics benchmark line.
  benchmark: { key: "VWCE", label: null, closes: null, fetchedAt: null, status: null },
};

function sanitizeSavingsPlan(v) {
  if (!v || typeof v !== "object" || !Array.isArray(v.rows)) return { rows: [], monthly: 0, setAt: null };
  const seen = new Set();
  const rows = v.rows
    .filter(r => r && typeof r.ticker === "string")
    .map(r => ({
      ticker: sanitizeStr(r.ticker, 12).toUpperCase(),
      name: typeof r.name === "string" ? sanitizeStr(r.name, 32) : "",
      amount: Math.round(sanitizeNum(r.amount, 0, 1_000_000, 0)),
    }))
    .filter(r => {
      if (!r.ticker || r.amount < 1 || seen.has(r.ticker)) return false;
      seen.add(r.ticker);
      return true;
    })
    .slice(0, 40);
  return {
    rows,
    monthly: Math.round(sanitizeNum(v.monthly, 0, 1_000_000, rows.reduce((s2, r) => s2 + r.amount, 0))),
    setAt: typeof v.setAt === "string" ? v.setAt : null,
  };
}

function sanitizeReview(v) {
  if (!v || typeof v !== "object") return { intervalMonths: 3, lastReviewedAt: null };
  const at = typeof v.lastReviewedAt === "string" && !isNaN(new Date(v.lastReviewedAt)) ? v.lastReviewedAt : null;
  return { intervalMonths: sanitizeNum(v.intervalMonths, 1, 24, 3), lastReviewedAt: at };
}

function sanitizeBenchmark(v) {
  const fallback = { key: "VWCE", label: null, closes: null, fetchedAt: null, status: null };
  if (!v || typeof v !== "object") return fallback;
  const key = BENCHMARK_OPTIONS.some(o => o.key === v.key) ? v.key : "VWCE";
  let closes = null;
  if (v.closes && typeof v.closes === "object") {
    closes = {};
    for (const [ym, px] of Object.entries(v.closes)) {
      const n = parseFloat(px);
      if (/^\d{4}-\d{2}$/.test(ym) && isFinite(n) && n > 0) closes[ym] = n;
    }
    if (!Object.keys(closes).length) closes = null;
  }
  return {
    key,
    label: typeof v.label === "string" ? v.label.slice(0, 60) : null,
    closes,
    fetchedAt: typeof v.fetchedAt === "string" ? v.fetchedAt : null,
    status: typeof v.status === "string" ? v.status.slice(0, 40) : null,
  };
}

function sanitizeIncome(v) {
  if (!v || typeof v !== "object") return { monthlyNet: 0, label: "", asOf: null };
  return {
    monthlyNet: sanitizeNum(v.monthlyNet, 0, 1_000_000, 0),
    label: typeof v.label === "string" ? v.label.slice(0, 60) : "",
    asOf: typeof v.asOf === "string" ? v.asOf : null,
  };
}

// Ties the monthly contribution to income, e.g. "always invest 10% of net pay".
// appliedFor records the income/pct combination already pushed into state.dca, so the
// rule fires once per change instead of fighting every manual edit.
function sanitizeDcaRule(v) {
  if (!v || typeof v !== "object") return { enabled: false, pctOfIncome: 10, appliedFor: "" };
  return {
    enabled: !!v.enabled,
    pctOfIncome: sanitizeNum(v.pctOfIncome, 0, 100, 10),
    appliedFor: typeof v.appliedFor === "string" ? v.appliedFor.slice(0, 32) : "",
  };
}

// Uninvested money sitting in the broker account (Trade Republic's "Available" balance).
// `committed` is the slice already earmarked for savings-plan orders that haven't executed
// yet, so it must not be double-spent by a lump-sum deployment plan.
function sanitizeCash(v) {
  if (!v || typeof v !== "object") return { available: 0, committed: 0, buffer: 0 };
  return {
    available: sanitizeNum(v.available, 0, 10_000_000, 0),
    committed: sanitizeNum(v.committed, 0, 10_000_000, 0),
    buffer: sanitizeNum(v.buffer, 0, 10_000_000, 0),
  };
}


// ─── STORAGE (versioned) ──────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY) || localStorage.getItem(LEGACY_STORE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    if (p.schemaVersion !== SCHEMA_VERSION && p.schemaVersion !== 2 && p.schemaVersion !== 3) return null;
    if (!Array.isArray(p.assets) || p.assets.length === 0) return null;
    const seen = new Set();
    const assets = p.assets.map(sanitizeAsset).map(a => {
      if (!a) return null;
      const forcedIcon = OFFICIAL_TICKER_ICONS[a.ticker];
      if (forcedIcon && Icons[forcedIcon]) return { ...a, icon: forcedIcon };
      return a;
    }).filter(a => {
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
      theme:            ["dark","light","auto"].includes(p.theme) ? p.theme : "auto",
      projectionMonths: sanitizeNum(p.projectionMonths, 1, 12, 3),
      history:          sanitizeHistory(p.history),
      schemaVersion:    SCHEMA_VERSION,
      live: {
        enabled: !!p?.live?.enabled,
        refreshSec: sanitizeNum(p?.live?.refreshSec, 15, 3600, 300),
        lastFetchedAt: typeof p?.live?.lastFetchedAt === "string" ? p.live.lastFetchedAt : null,
        providerHealth: p?.live?.providerHealth && typeof p.live.providerHealth === "object" ? p.live.providerHealth : {},
        unresolved: Array.isArray(p?.live?.unresolved) ? p.live.unresolved.slice(0, 20) : [],
        quoteData: p?.live?.quoteData && typeof p.live.quoteData === "object" ? p.live.quoteData : null,
        fxData: p?.live?.fxData && typeof p.live.fxData === "object" ? p.live.fxData : null,
      },
      alerts: {
        enabled: p?.alerts?.enabled !== false,
        driftThreshold: sanitizeNum(p?.alerts?.driftThreshold, 0.5, 10, 2),
      },
      priceSnapshots: Array.isArray(p?.priceSnapshots) ? p.priceSnapshots.slice(-300) : [],
      brokerImportLog: Array.isArray(p?.brokerImportLog) ? p.brokerImportLog.slice(-40) : [],
      income: sanitizeIncome(p?.income),
      dcaSchedule: sanitizeDcaSchedule(p?.dcaSchedule),
      dcaAutoAppliedIds: Array.isArray(p?.dcaAutoAppliedIds) ? p.dcaAutoAppliedIds.filter(x => typeof x === "string").slice(-48) : [],
      cash: sanitizeCash(p?.cash),
      savingsPlan: sanitizeSavingsPlan(p?.savingsPlan),
      review: sanitizeReview(p?.review),
      benchmark: sanitizeBenchmark(p?.benchmark),
      dcaRule: sanitizeDcaRule(p?.dcaRule),
      lastBackupAt: typeof p?.lastBackupAt === "string" ? p.lastBackupAt : null,
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
  const header = ["Ticker", "Name", "Category", "Holdings", `Current Value (${currency})`, "Target %", "Actual %", "Drift %"].join(",");
  const rows = enrich(assets, total).map(a =>
    [a.ticker, `"${a.name}"`, a.cat, a.holdings != null ? a.holdings : "", a.current.toFixed(2), a.target.toFixed(2), a.pct.toFixed(2), a.drift.toFixed(2)].join(",")
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
  const [displayedTab, setDisplayedTab] = useState(0);
  const [tabTransit, setTabTransit]     = useState(false);
  const [loaded, setLoaded]     = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cmdOpen, setCmdOpen]   = useState(false);
  const [toast, setToast]       = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmLock, setConfirmLock]   = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [activeTheme, setActiveTheme]   = useState(() => resolveTheme(loadState()?.theme || "auto"));
  const [dcaPickerOpen, setDcaPickerOpen] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const toastRef    = useRef(null);
  const fileInputRef = useRef(null);
  const brokerFileInputRef = useRef(null);
  const pdfFileInputRef = useRef(null);
  const tabTimerRef  = useRef(null);
  const liveTimerRef = useRef(null);

  // Theme
  useEffect(() => {
    const prEl = document.querySelector('.pr');
    prEl?.classList.add('theme-transitioning');
    const t = resolveTheme(state.theme);
    setActiveTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    const timer = setTimeout(() => prEl?.classList.remove('theme-transitioning'), 400);
    return () => clearTimeout(timer);
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

  // Weekly auto-backup: localStorage is the only copy of this data, so periodically
  // download a JSON snapshot without requiring the user to remember to export.
  useEffect(() => {
    if (!loaded) return;
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const last = state.lastBackupAt ? new Date(state.lastBackupAt).getTime() : null;
    if (last == null) {
      // First run on this device: establish a baseline instead of downloading immediately.
      setState(s => ({ ...s, lastBackupAt: new Date().toISOString() }));
      return;
    }
    if (Date.now() - last >= WEEK_MS) {
      exportJSON(state);
      setState(s => ({ ...s, lastBackupAt: new Date().toISOString() }));
      showToast("Weekly backup downloaded automatically", "info");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Tab switching with transition
  const switchTab = useCallback((newTab) => {
    if (newTab === tab) return;
    setTab(newTab);
    setTabTransit(true);
    if (tabTimerRef.current) clearTimeout(tabTimerRef.current);
    tabTimerRef.current = setTimeout(() => {
      setDisplayedTab(newTab);
      setTabTransit(false);
    }, 150);
  }, [tab]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmdOpen(v => !v); }
      if (e.key === "Escape") { setSettingsOpen(false); setConfirmLock(false); setConfirmReset(false); setDcaPickerOpen(false); setCmdOpen(false); setPendingRemove(null); }
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
  const sortedDrift = useMemo(() => [...enriched].sort((a, b) => b.current - a.current), [enriched]);
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
  const cy = CURRENCY_SYMBOL;
  const isoCurrency = CURRENCY_ISO;
  const liveModel = useMemo(() => {
    const quoteData = state?.live?.quoteData || null;
    const fxData = state?.live?.fxData || null;
    if (!quoteData || !fxData) return null;
    return buildLiveModel({
      assets: state.assets,
      quotesData: quoteData,
      fxData,
      currency: isoCurrency,
    });
  }, [state.assets, state?.live?.quoteData, state?.live?.fxData, isoCurrency]);

  const upcomingDcaChange = useMemo(() => nextDcaFromSchedule(state.dcaSchedule || []), [state.dcaSchedule]);
  const savingsRatePct = useMemo(() => {
    const income = state.income?.monthlyNet || 0;
    if (!income || income <= 0) return null;
    return (state.dca / income) * 100;
  }, [state.income, state.dca]);

  // Portfolio-wide unrealized P&L, from cost basis rather than a live-tracking baseline.
  const unrealized = useMemo(() => {
    const basis = state.assets.reduce((s, a) => s + (a.costBasis != null ? a.costBasis : a.current), 0);
    if (basis <= 0) return null;
    const abs = total - basis;
    return { basis, abs, pct: (abs / basis) * 100 };
  }, [state.assets, total]);

  // Annual distribution yield per asset, plus the UCITS flag that decides whether a
  // distribution is taxed at source. Kept out of updateAsset because an empty box means
  // "unknown", which is a different answer from zero and must survive as null.
  const updateYield = useCallback((ticker, raw, ucits) => {
    setState(s => ({
      ...s,
      assets: s.assets.map(a => {
        if (a.ticker !== ticker) return a;
        const cleared = raw === "" || raw == null;
        return {
          ...a,
          yieldPct: cleared ? null : sanitizeNum(raw, 0, 100, a.yieldPct),
          ...(ucits === undefined ? {} : { ucits: !!ucits }),
        };
      }),
    }));
  }, []);

  // Month-end closes for the benchmark counterfactual. A failure is reported as a status
  // the Analytics tab explains, not as a silently empty chart.
  const [benchLoading, setBenchLoading] = useState(false);
  const refreshBenchmark = useCallback(async (key) => {
    const target = BENCHMARK_OPTIONS.some(o => o.key === key) ? key : "VWCE";
    setBenchLoading(true);
    try {
      const res = await fetch(`/api/market/history?benchmark=${encodeURIComponent(target)}&months=120`, { credentials: "same-origin" });
      const data = await res.json();
      setState(s => ({
        ...s,
        benchmark: sanitizeBenchmark({
          key: target,
          label: data?.label || null,
          // Keep a previously loaded series for the same benchmark rather than blanking
          // the chart because one refresh failed.
          closes: data?.ok ? data.closes : (s.benchmark?.key === target ? s.benchmark?.closes : null),
          fetchedAt: data?.ok ? new Date().toISOString() : (s.benchmark?.fetchedAt || null),
          status: data?.ok ? "ok" : (data?.reason || "fetch_failed"),
        }),
      }));
      if (data?.ok) showToast(`${data.label || target}: ${Object.keys(data.closes).length} months of prices loaded.`);
      else showToast(data?.error || "Benchmark prices unavailable.", "error");
    } catch (err) {
      setState(s => ({ ...s, benchmark: sanitizeBenchmark({ ...(s.benchmark || {}), key: target, status: "fetch_failed" }) }));
      showToast(`Benchmark fetch failed: ${err.message}`, "error");
    } finally {
      setBenchLoading(false);
    }
  }, [showToast]);

  const setBenchmarkKey = useCallback((key) => {
    const target = BENCHMARK_OPTIONS.some(o => o.key === key) ? key : "VWCE";
    // Switching benchmark invalidates the cached closes — they belong to the old symbol.
    setState(s => ({ ...s, benchmark: { key: target, label: null, closes: null, fetchedAt: null, status: null } }));
    refreshBenchmark(target);
  }, [refreshBenchmark]);

  // Backfilled months are merged through the same sanitiser as an imported backup and
  // re-sorted, so a month added out of order still lands in the right place on the chart.
  const addBackfillMonth = useCallback((entry) => {
    setState(s => ({ ...s, history: sanitizeHistory([...(s.history || []), entry]) }));
  }, []);

  const removeHistoryEntry = useCallback((completedAt) => {
    setState(s => ({ ...s, history: (s.history || []).filter(h => h.completedAt !== completedAt) }));
    showToast("Month removed from history.");
  }, [showToast]);

  const updateReview = useCallback((patch) => {
    setState(s => ({ ...s, review: sanitizeReview({ ...(s.review || {}), ...patch }) }));
  }, []);

  const saveSavingsPlan = useCallback((rows, monthly) => {
    setState(s => ({ ...s, savingsPlan: sanitizeSavingsPlan({ rows, monthly, setAt: new Date().toISOString() }) }));
    showToast("Savings plan recorded — the app will flag it when it drifts.");
  }, [showToast]);

  // A focused type=number input eats the scroll wheel and silently changes its value —
  // a classic way to corrupt a figure you were only scrolling past. Blur it instead and
  // let the page scroll.
  useEffect(() => {
    const onWheel = (e) => {
      const el = document.activeElement;
      if (el && el.tagName === "INPUT" && el.type === "number" && el === e.target) el.blur();
    };
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  const cashFree = useMemo(() => freeCash(state.cash), [state.cash]);
  const netWorth = total + (state.cash?.available || 0);

  // Money-weighted return over the whole tracked history. Simple "since buy" percentages
  // overstate a portfolio built by monthly contributions, because money added last month
  // has not had the same time to work as money added two years ago.
  const wholeSeries = useMemo(() => buildMonthlySeries(state.history, state.assets), [state.history, state.assets]);
  const irrAnnual = useMemo(() => seriesIrr(wholeSeries), [wholeSeries]);

  const review = useMemo(
    () => reviewStatus(state.review?.lastReviewedAt, state.review?.intervalMonths),
    [state.review],
  );
  const markReviewed = useCallback(() => {
    setState(s => ({ ...s, review: { ...(s.review || { intervalMonths: 3 }), lastReviewedAt: new Date().toISOString() } }));
    showToast("Review logged — next one scheduled.");
  }, [showToast]);

  // Auto-apply a scheduled DCA change once, the first time its effective month arrives.
  // After that, state.dca is yours to edit manually until the *next* schedule entry
  // becomes due — it no longer gets silently overwritten on every render.
  useEffect(() => {
    if (!state.dcaSchedule?.length) return;
    const applied = new Set(state.dcaAutoAppliedIds || []);
    const ym = currentMonthYM();
    const dueUnapplied = state.dcaSchedule
      .filter(s => s.effectiveFrom <= ym && !applied.has(s.id))
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    if (!dueUnapplied.length) return;
    const latest = dueUnapplied[dueUnapplied.length - 1];
    setState(s => ({
      ...s,
      dca: latest.amount,
      dcaAutoAppliedIds: [...new Set([...(s.dcaAutoAppliedIds || []), ...dueUnapplied.map(x => x.id)])],
    }));
  }, [state.dcaSchedule, state.dcaAutoAppliedIds]);

  // Keep DCA tied to income when the rule is on. Fires once per income/percentage
  // change, so a deliberate manual override survives until one of those inputs moves.
  useEffect(() => {
    const rule = state.dcaRule;
    if (!rule?.enabled) return;
    const income = state.income?.monthlyNet || 0;
    if (income <= 0) return;
    const signature = `${income}:${rule.pctOfIncome}`;
    if (rule.appliedFor === signature) return;
    const derived = dcaFromIncome(income, rule.pctOfIncome);
    if (derived <= 0) return;
    setState(s => ({
      ...s,
      dca: derived,
      dcaRule: sanitizeDcaRule({ ...(s.dcaRule || {}), appliedFor: signature }),
    }));
  }, [state.dcaRule, state.income]);

  const driftAlerts = useMemo(() => {
    if (!state.alerts.enabled) return [];
    const threshold = sanitizeNum(state.alerts.driftThreshold, 0.5, 10, 2);
    const month1Buys = projection.steps[0]?.buys || [];
    return enriched
      .filter(a => Math.abs(a.drift) >= threshold)
      .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
      .map(a => {
        const suggested = month1Buys.find(x => x.ticker === a.ticker)?.buy || 0;
        return { ...a, suggestedBuy: suggested };
      });
  }, [enriched, projection.steps, state.alerts.enabled, state.alerts.driftThreshold]);

  // ── Handlers ──
  const updateAsset = useCallback((ticker, field, raw) => {
    setState(s => ({
      ...s,
      assets: s.assets.map(a => {
        if (a.ticker !== ticker) return a;
        if (field === "current") {
          const current = sanitizeNum(raw, 0, 10_000_000, a.current);
          // If holdings-based auto-calc is active for this asset, back-solve holdings
          // from the manually typed value so the next live refresh doesn't silently
          // revert your override — it'll only drift again once the price actually moves.
          const price = liveModel?.rows?.find(r => r.ticker === ticker)?.quotePrice;
          if (a.holdings > 0 && price > 0) {
            return { ...a, current, holdings: Math.round((current / price) * 1e8) / 1e8 };
          }
          return { ...a, current };
        }
        if (field === "target")  return { ...a, target: sanitizeNum(raw, 0, 100, a.target) };
        if (field === "ticker") {
          const clean = sanitizeStr(String(raw).toUpperCase(), 10).replace(/[^A-Z0-9.&]/g, "");
          if (!clean || s.assets.some(x => x.ticker === clean && x.ticker !== ticker)) return a;
          return { ...a, ticker: clean };
        }
        if (field === "name") return { ...a, name: sanitizeStr(raw, 40) };
        if (field === "cat")  return { ...a, cat: CATEGORIES.includes(raw) ? raw : a.cat };
        if (field === "icon") return { ...a, icon: Icons[raw] ? raw : a.icon };
        if (field === "holdings") {
          const v = raw === "" || raw == null ? undefined : sanitizeNum(raw, 0, 1_000_000_000, a.holdings);
          if (v === undefined) { const { holdings: _, ...rest } = a; return rest; }
          return { ...a, holdings: v };
        }
        return a;
      }),
    }));
  }, [liveModel]);

  const updateDca = useCallback((v) => {
    const n = sanitizeNum(v, 1, 1_000_000, state.dca);
    setState(s => ({ ...s, dca: n }));
  }, [state.dca]);

  const applyDcaFromPicker = useCallback((v) => {
    updateDca(v);
    setDcaPickerOpen(false);
    showToast("DCA updated");
  }, [updateDca, showToast]);

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
    setState(s => {
      let ticker;
      let n = s.assets.length;
      do { ticker = `NEW${n}`; n += 1; } while (s.assets.some(a => a.ticker === ticker));
      return {
        ...s,
        assets: [...s.assets, { name:"New Asset", ticker, cat:"ETF", current:0, target:0, icon:"barChart", holdings: 0, costBasis: 0 }],
      };
    });
  }, []);

  const [pendingRemove, setPendingRemove] = useState(null);
  const undoRef = useRef(null);

  const requestRemoveAsset = useCallback((ticker) => {
    const asset = state.assets.find(a => a.ticker === ticker);
    if (asset) setPendingRemove(asset);
  }, [state.assets]);

  const confirmRemoveAsset = useCallback(() => {
    if (!pendingRemove) return;
    const removed = pendingRemove;
    setState(s => ({ ...s, assets: s.assets.filter(a => a.ticker !== removed.ticker) }));
    setPendingRemove(null);
    // undo toast
    if (undoRef.current) clearTimeout(undoRef.current);
    setToast({ msg: `${removed.name || removed.ticker} removed`, type: "info", undo: () => {
      setState(s => ({ ...s, assets: [...s.assets, removed] }));
      setToast(null);
    }});
    undoRef.current = setTimeout(() => setToast(null), 6000);
  }, [pendingRemove]);

  const cancelRemoveAsset = useCallback(() => setPendingRemove(null), []);

  const updateIncome = useCallback((patch) => {
    setState(s => ({
      ...s,
      income: sanitizeIncome({ ...(s.income || {}), ...patch, asOf: new Date().toISOString() }),
    }));
  }, []);

  const updateCash = useCallback((patch) => {
    setState(s => ({ ...s, cash: sanitizeCash({ ...(s.cash || {}), ...patch }) }));
  }, []);

  const updateDcaRule = useCallback((patch) => {
    setState(s => ({ ...s, dcaRule: sanitizeDcaRule({ ...(s.dcaRule || {}), ...patch }) }));
  }, []);

  const addDcaScheduleEntry = useCallback((entry) => {
    setState(s => {
      const next = sanitizeDcaSchedule([
        ...(s.dcaSchedule || []),
        { id: `sch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, ...entry },
      ]);
      return { ...s, dcaSchedule: next };
    });
  }, []);

  const removeDcaScheduleEntry = useCallback((id) => {
    setState(s => ({ ...s, dcaSchedule: (s.dcaSchedule || []).filter(x => x.id !== id) }));
  }, []);

  const applyScheduledDca = useCallback((amount, id) => {
    const n = sanitizeNum(amount, 1, 1_000_000, 0);
    if (!n) return;
    setState(s => ({
      ...s,
      dca: n,
      dcaAutoAppliedIds: id ? [...new Set([...(s.dcaAutoAppliedIds || []), id])] : s.dcaAutoAppliedIds,
    }));
    showToast(`Monthly DCA updated to ${n}`);
  }, [showToast]);

  const refreshLiveData = useCallback(async (opts = {}) => {
    if (!state.assets.length) return;
    const silent = !!opts.silent;
    if (!silent) setLiveLoading(true);
    setLiveError("");
    try {
      const [quotesData, fxData] = await Promise.all([
        fetchLiveQuotes(state.assets),
        fetchFxRates("USD"),
      ]);
      setState(s => {
        const livePatch = {
          ...(s.live || {}),
          enabled: true,
          quoteData: quotesData,
          fxData,
          providerHealth: quotesData.providerHealth || {},
          unresolved: quotesData.unresolved || [],
          lastFetchedAt: quotesData.fetchedAt || new Date().toISOString(),
        };

        const model = buildLiveModel({
          assets: s.assets,
          quotesData,
          fxData,
          currency: CURRENCY_ISO,
        });

        let priceSnapshots = s.priceSnapshots || [];
        const nowMs = Date.now();
        const lastSnapMs = new Date(priceSnapshots[priceSnapshots.length - 1]?.capturedAt || 0).getTime();
        if (!lastSnapMs || nowMs - lastSnapMs >= 60 * 1000) {
          const pushed = pushLocalSnapshot(priceSnapshots, model, CURRENCY_SYMBOL);
          priceSnapshots = pushed.list;
          persistSnapshotRemote(pushed.snap).catch(() => null);
        }

        // Auto-update current values for assets with holdings set
        const updatedAssets = s.assets.map(a => {
          const row = model.rows.find(r => r.ticker === a.ticker);
          if (row?.holdingsComputed) {
            return { ...a, current: Math.round(row.liveValue * 100) / 100 };
          }
          return a;
        });

        return { ...s, assets: updatedAssets, live: livePatch, priceSnapshots };
      });
      if (!silent) showToast("Live prices refreshed");
    } catch (error) {
      const msg = error?.message || "Failed to refresh live data";
      setLiveError(msg);
      if (!silent) showToast(msg, "error");
    } finally {
      if (!silent) setLiveLoading(false);
    }
  }, [state.assets, showToast]);

  const toggleLiveTracking = useCallback((enabled) => {
    setState(s => ({ ...s, live: { ...s.live, enabled } }));
    if (enabled) refreshLiveData();
  }, [refreshLiveData]);

  const updateLiveRefreshSec = useCallback((v) => {
    const refreshSec = sanitizeNum(v, 15, 3600, 300);
    setState(s => ({ ...s, live: { ...s.live, refreshSec } }));
  }, []);

  const handleBrokerImport = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = importBrokerCsv(String(ev.target?.result || ""));
        if (!parsed.assets.length) {
          showToast("No valid positions found in CSV", "error");
          return;
        }
        setState(s => {
          const merged = [...s.assets];
          for (const row of parsed.assets) {
            const idx = merged.findIndex(a => a.ticker === row.ticker);
            if (idx >= 0) {
              merged[idx] = {
                ...merged[idx],
                name: row.name || merged[idx].name,
                cat: CATEGORIES.includes(row.cat) ? row.cat : merged[idx].cat,
                current: sanitizeNum(row.current, 0, 10_000_000, merged[idx].current),
                target: row.target > 0 ? sanitizeNum(row.target, 0, 100, merged[idx].target) : merged[idx].target,
                ...(row.holdings > 0 ? { holdings: row.holdings } : {}),
              };
            } else {
              merged.push({
                name: sanitizeStr(row.name || row.ticker, 40),
                ticker: row.ticker,
                cat: CATEGORIES.includes(row.cat) ? row.cat : "Other",
                current: sanitizeNum(row.current, 0, 10_000_000, 0),
                target: sanitizeNum(row.target, 0, 100, 0),
                icon: "barChart",
                costBasis: sanitizeNum(row.current, 0, 10_000_000, 0),
                ...(row.holdings > 0 ? { holdings: row.holdings } : {}),
              });
            }
          }
          const logEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            importedAt: new Date().toISOString(),
            source: "trade-republic",
            importedRows: parsed.importedRows,
            totalRows: parsed.totalRows,
            fileName: file.name,
          };
          return { ...s, assets: merged, brokerImportLog: [...(s.brokerImportLog || []), logEntry].slice(-40) };
        });
        showToast(`Imported ${parsed.importedRows} positions from Trade Republic CSV`);
      } catch (error) {
        showToast(`Broker CSV import failed: ${error?.message || "Unknown error"}`, "error");
      }
    };
    reader.onerror = () => showToast("Could not read CSV file", "error");
    reader.readAsText(file);
  }, [showToast]);

  const handlePdfImport = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const buffer = await file.arrayBuffer();
      const result = await importTradeRepublicPdf(buffer);
      if (!result.assets.length) {
        showToast(`No positions found in PDF (detected: ${result.type}). Try CSV import instead.`, "error");
        return;
      }
      setState(s => {
        const merged = [...s.assets];
        for (const row of result.assets) {
          const idx = merged.findIndex(a => a.ticker === row.ticker || (row._isin && a._isin === row._isin));
          if (idx >= 0) {
            merged[idx] = {
              ...merged[idx],
              name: row.name || merged[idx].name,
              cat: CATEGORIES.includes(row.cat) ? row.cat : merged[idx].cat,
              current: row.current > 0 ? sanitizeNum(row.current, 0, 10_000_000, merged[idx].current) : merged[idx].current,
              ...(row._isin ? { _isin: row._isin } : {}),
              ...(row.holdings > 0 ? { holdings: row.holdings } : {}),
            };
          } else {
            merged.push({
              name: sanitizeStr(row.name || row.ticker, 40),
              ticker: row.ticker,
              cat: CATEGORIES.includes(row.cat) ? row.cat : "Other",
              current: sanitizeNum(row.current, 0, 10_000_000, 0),
              target: 0,
              icon: OFFICIAL_TICKER_ICONS[row.ticker] || "barChart",
              costBasis: sanitizeNum(row.current, 0, 10_000_000, 0),
              ...(row._isin ? { _isin: row._isin } : {}),
              ...(row.holdings > 0 ? { holdings: row.holdings } : {}),
            });
          }
        }
        const logEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          source: `TR PDF (${result.type})`,
          totalRows: result.totalRows,
          importedRows: result.importedRows,
          importedAt: new Date().toISOString(),
        };
        return {
          ...s,
          assets: merged,
          brokerImportLog: [...(s.brokerImportLog || []).slice(-39), logEntry],
        };
      });
      showToast(`Imported ${result.importedRows} positions from Trade Republic ${result.type} PDF`);
    } catch (error) {
      showToast(`PDF import failed: ${error?.message || "Unknown error"}`, "error");
    }
  }, [showToast]);

  useEffect(() => {
    if (!state?.live?.enabled) {
      if (liveTimerRef.current) {
        clearInterval(liveTimerRef.current);
        liveTimerRef.current = null;
      }
      return;
    }
    const refreshMs = sanitizeNum(state?.live?.refreshSec, 15, 3600, 300) * 1000;
    if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    liveTimerRef.current = setInterval(() => refreshLiveData({ silent: true }), refreshMs);
    return () => {
      if (liveTimerRef.current) {
        clearInterval(liveTimerRef.current);
        liveTimerRef.current = null;
      }
    };
  }, [state?.live?.enabled, state?.live?.refreshSec, refreshLiveData]);

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
      if (!b) return { ...a };
      // Locking in money invested always grows cost basis. If we know a live price
      // per unit, also grow holdings so the next live refresh doesn't erase this buy
      // by recomputing current = holdings × price from the old (pre-buy) quantity.
      const quoteRow = liveModel?.rows?.find(r => r.ticker === a.ticker);
      const price = a.holdings > 0 && quoteRow?.quotePrice > 0 ? quoteRow.quotePrice : null;
      const costBasis = Math.round(((a.costBasis ?? a.current) + b.buy) * 100) / 100;
      const current = Math.round((a.current + b.buy) * 100) / 100;
      if (price) {
        const holdings = Math.round((a.holdings + b.buy / price) * 1e8) / 1e8;
        return { ...a, holdings, current, costBasis };
      }
      return { ...a, current, costBasis };
    });
    setState(s => ({ ...s, assets: newAssets, history: [...s.history, snap] }));
    setConfirmLock(false);
    setTab(0);
    showToast(`Month ${state.history.length + 1} locked — portfolio updated!`);
  }, [projection, state.assets, state.history.length, total, showToast, liveModel]);

  // Apply a lump-sum cash deployment: grow each position's value and cost basis by the
  // amount bought, grow holdings where we know a unit price, and draw the total down
  // from the available cash balance.
  const doDeployCash = useCallback((buys) => {
    if (!buys?.length) return;
    const spent = buys.reduce((s, b) => s + b.buy, 0);
    setState(s => {
      const assets = s.assets.map(a => {
        const b = buys.find(x => x.ticker === a.ticker);
        if (!b) return a;
        const quoteRow = liveModel?.rows?.find(r => r.ticker === a.ticker);
        const price = a.holdings > 0 && quoteRow?.quotePrice > 0 ? quoteRow.quotePrice : null;
        const costBasis = Math.round(((a.costBasis ?? a.current) + b.buy) * 100) / 100;
        const current = Math.round((a.current + b.buy) * 100) / 100;
        if (price) {
          return { ...a, holdings: Math.round((a.holdings + b.buy / price) * 1e8) / 1e8, current, costBasis };
        }
        return { ...a, current, costBasis };
      });
      const cash = sanitizeCash({
        ...(s.cash || {}),
        available: Math.max(0, (s.cash?.available || 0) - spent),
      });
      const snap = {
        label: `Cash deployment`,
        assets: s.assets.map(a => ({ ...a })),
        total: s.assets.reduce((sum, a) => sum + a.current, 0),
        buys,
        completedAt: new Date().toISOString(),
        note: `Lump-sum deployment of ${CURRENCY_SYMBOL}${spent} from idle cash.`,
      };
      return { ...s, assets, cash, history: [...s.history, snap] };
    });
  }, [liveModel]);

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
        // Accept v2, v3 and v4 backups
        if (parsed.schemaVersion !== SCHEMA_VERSION && parsed.schemaVersion !== 2 && parsed.schemaVersion !== 3) {
          showToast("Incompatible backup version (expected v2, v3 or v4).", "error");
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
          theme:            ["dark","light","auto"].includes(parsed.theme) ? parsed.theme : "auto",
          projectionMonths: sanitizeNum(parsed.projectionMonths, 1, 12, 3),
          history:          sanitizeHistory(parsed.history),
          schemaVersion:    SCHEMA_VERSION,
          live: {
            enabled: !!parsed?.live?.enabled,
            refreshSec: sanitizeNum(parsed?.live?.refreshSec, 15, 300, 60),
            lastFetchedAt: typeof parsed?.live?.lastFetchedAt === "string" ? parsed.live.lastFetchedAt : null,
            providerHealth: parsed?.live?.providerHealth && typeof parsed.live.providerHealth === "object" ? parsed.live.providerHealth : {},
            unresolved: Array.isArray(parsed?.live?.unresolved) ? parsed.live.unresolved.slice(0, 20) : [],
            quoteData: parsed?.live?.quoteData && typeof parsed.live.quoteData === "object" ? parsed.live.quoteData : null,
            fxData: parsed?.live?.fxData && typeof parsed.live.fxData === "object" ? parsed.live.fxData : null,
          },
          alerts: {
            enabled: parsed?.alerts?.enabled !== false,
            driftThreshold: sanitizeNum(parsed?.alerts?.driftThreshold, 0.5, 10, 2),
          },
          priceSnapshots: Array.isArray(parsed?.priceSnapshots) ? parsed.priceSnapshots.slice(-300) : [],
          brokerImportLog: Array.isArray(parsed?.brokerImportLog) ? parsed.brokerImportLog.slice(-40) : [],
          income: sanitizeIncome(parsed?.income),
          dcaSchedule: sanitizeDcaSchedule(parsed?.dcaSchedule),
          dcaAutoAppliedIds: Array.isArray(parsed?.dcaAutoAppliedIds) ? parsed.dcaAutoAppliedIds.filter(x => typeof x === "string").slice(-48) : [],
          cash: sanitizeCash(parsed?.cash),
          savingsPlan: sanitizeSavingsPlan(parsed?.savingsPlan),
          review: sanitizeReview(parsed?.review),
          benchmark: sanitizeBenchmark(parsed?.benchmark),
          dcaRule: sanitizeDcaRule(parsed?.dcaRule),
          lastBackupAt: new Date().toISOString(),
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
    { label:"Overview",  icon:"barChart", short:"Overview" },
    { label:"Plan",      icon:"calendar", short:"Plan"     },
    { label:"Analytics", icon:"trendUp",  short:"Stats"    },
    { label:"History",   icon:"history",  short:"History"  },
  ];

  return (
    <div className={`pr ${activeTheme}`}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
      <div className="pr-glow g1" aria-hidden="true"/><div className="pr-glow g2" aria-hidden="true"/>
      <input ref={fileInputRef} type="file" accept=".json" style={{ display:"none" }} onChange={handleImport} aria-hidden="true"/>
      <input ref={brokerFileInputRef} type="file" accept=".csv,text/csv" style={{ display:"none" }} onChange={handleBrokerImport} aria-hidden="true"/>
      <input ref={pdfFileInputRef} type="file" accept=".pdf,application/pdf" style={{ display:"none" }} onChange={handlePdfImport} aria-hidden="true"/>

      {toast && (
        <div className={`toast toast-${toast.type || "success"}`} role="alert" aria-live="assertive">
          <Icon name={toast.type === "error" ? "warning" : "circleCheck"} style={{ width:15, height:15, flexShrink:0 }}/>
          {toast.msg}
          {toast.undo && (
            <button className="toast-undo-btn" onClick={toast.undo}>Undo</button>
          )}
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
                <span className="hdr-sub">
                  {state.assets.length} assets · Buy-only · <PlatformBadge/>
                  {netWorth > total && <> · Net <strong className="mono">{cy}{Math.round(netWorth).toLocaleString()}</strong></>}
                </span>
                <span className="hdr-sep">·</span>
                <button className="dca-pill" onClick={() => setDcaPickerOpen(true)} title={savingsRatePct != null ? `${savingsRatePct.toFixed(1)}% of net income — click to edit` : "Open DCA editor"}>
                  <Icon name="zap" style={{ width:12, height:12 }}/>
                  <span className="mono">{cy}{state.dca}/mo{savingsRatePct != null ? ` · ${savingsRatePct.toFixed(0)}%` : ""}</span>
                  <Icon name="edit" style={{ width:10, height:10, opacity:0.5 }}/>
                </button>
              </div>
            </div>
            <div className="hdr-actions">
              <ThemeToggle theme={state.theme} onToggle={(t) => setState(s => ({ ...s, theme: t }))}/>
              <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings" aria-label="Open settings">
                <Icon name="settings" style={{ width:17, height:17 }}/>
              </button>
              <a className="icon-btn" href="/api/auth/logout" title="Sign out" aria-label="Sign out">
                <Icon name="logout" style={{ width:17, height:17 }}/>
              </a>
            </div>
          </div>
        </header>

        {/* ── KPIs ── */}
        {(() => {
          const histTotals = state.history.map(h => h.total);
          const kpiRings = [
            Math.min(100, Math.max(0, 100 - projAvgDrift * 15)),
            100,
            // Ring reads "how much of a monthly contribution is sitting idle" — full is bad here.
            state.dca > 0 ? Math.min(100, (cashFree / state.dca) * 100) : (cashFree > 0 ? 100 : 0),
            irrAnnual != null ? Math.min(100, Math.max(0, (irrAnnual * 100 + 10) * 3.3)) : 0,
          ];
          const kpiSparks = [
            histTotals.length >= 2 ? histTotals.slice(-8) : null,
            null,
            null,
            wholeSeries.length >= 2 ? wholeSeries.map(p => p.value).slice(-8) : null,
          ];
          return (
            <div className={`kpi-grid ${loaded ? "in" : ""}`} role="region" aria-label="Portfolio summary">
              {[
                {
                  l:"Portfolio",
                  v:`${cy}${Math.round(total).toLocaleString()}`,
                  s: unrealized
                    ? `${unrealized.abs >= 0 ? "+" : "−"}${cy}${Math.abs(Math.round(unrealized.abs)).toLocaleString()} (${unrealized.pct >= 0 ? "+" : ""}${unrealized.pct.toFixed(1)}%) since buy`
                    : "Current value",
                  c:"var(--accent-blue)", icon:"wallet",
                },
                {
                  l:"Monthly DCA",
                  v:`${cy}${state.dca}`,
                  s: savingsRatePct != null
                    ? `${savingsRatePct.toFixed(1)}% of ${cy}${state.income.monthlyNet} net`
                    : (upcomingDcaChange ? `Next: ${cy}${upcomingDcaChange.amount} from ${upcomingDcaChange.effectiveFrom}` : "Per contribution"),
                  c:"var(--accent-indigo)", icon:"zap",
                },
                {
                  // Idle cash beats a projection here: it is the one number that asks for
                  // an action today, and uninvested cash was the portfolio's real leak.
                  l:"Idle Cash",
                  v:`${cy}${Math.round(cashFree).toLocaleString()}`,
                  s: cashFree >= 1
                    ? `Ready to deploy${state.cash?.committed ? ` · ${cy}${Math.round(state.cash.committed)} committed` : ""}`
                    : "Nothing sitting uninvested",
                  c: cashFree >= state.dca ? "var(--accent-amber)" : "var(--accent-green)", icon:"coins",
                },
                {
                  l:"Return (IRR)",
                  v: irrAnnual != null ? `${irrAnnual >= 0 ? "+" : "−"}${Math.abs(irrAnnual * 100).toFixed(1)}%` : "—",
                  s: irrAnnual != null ? "Money-weighted, annualised" : "Needs two months of history",
                  c: irrAnnual == null ? "var(--text3)" : irrAnnual >= 0 ? "var(--accent-green)" : "var(--accent-red)",
                  icon:"trendUp",
                },
              ].map((k, i) => (
                <div key={i} className="kpi">
                  <div className="kpi-header">
                    <div className="kpi-l">{k.l}</div>
                    <ProgressRing pct={kpiRings[i]} color={k.c} size={26}/>
                  </div>
                  <div className="kpi-v mono" style={{ color:k.c }}>{k.v}</div>
                  <div className="kpi-s">{k.s}</div>
                  {kpiSparks[i] && <MiniSparkline values={kpiSparks[i]} color={k.c}/>}
                </div>
              ))}
            </div>
          );
        })()}

        <HowTo title="What these four numbers mean">
          <p><strong>Portfolio</strong> is what your holdings are worth right now. <strong>Monthly DCA</strong> is what
          you contribute each month — tied to a percentage of income if you switched that rule on.</p>
          <p><strong>Idle Cash</strong> is money sitting in the account doing nothing: your available balance minus
          anything already committed to savings-plan orders, minus your buffer. It replaced a projection tile because
          it is the only one of the four that asks you to do something today.</p>
          <p><strong>Return (IRR)</strong> is your money-weighted annual return. It is not the same as the
          &ldquo;since buy&rdquo; percentage under Portfolio: that one ignores <em>when</em> each euro arrived, so it
          flatters a portfolio whose recent contributions haven&apos;t had time to work. IRR accounts for the dates.</p>
          <HowToTip>The ring around Idle Cash fills as idle cash approaches one month&apos;s contribution. A full amber
          ring means you are holding back a whole month of investing.</HowToTip>
          <HowToTip warn>IRR needs at least two months of history and reads wildly in the first few — a 3% gain over
          six weeks annualises to a number that means very little. Trust it from about six months on.</HowToTip>
        </HowTo>

        {review.state !== "ok" && (
          <div className={`banner ${review.state === "overdue" ? "banner-warn" : "banner-info"}`} role={review.state === "overdue" ? "alert" : "status"}>
            <Icon name={review.state === "overdue" ? "warning" : "calendar"} style={{ width:16, height:16, flexShrink:0 }}/>
            <span>
              {review.state === "unset"
                ? <>No portfolio review logged yet. Your plan calls for one every <strong>{state.review?.intervalMonths ?? 3} months</strong>.</>
                : review.state === "overdue"
                  ? <>Portfolio review is <strong>{Math.abs(review.days)} day{Math.abs(review.days) === 1 ? "" : "s"} overdue</strong> — it was due {review.due.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}.</>
                  : <>Portfolio review due in <strong>{review.days} day{review.days === 1 ? "" : "s"}</strong> ({review.due.toLocaleDateString("en-GB", { day:"numeric", month:"short" })}).</>}
            </span>
            <button className="btn-ghost sm" onClick={markReviewed} style={{ marginLeft:"auto", flexShrink:0 }}>
              <Icon name="check" style={{ width:12, height:12 }}/>Mark reviewed
            </button>
          </div>
        )}

        {!targetOk && (
          <div className="banner banner-warn" role="alert">
            <Icon name="warning" style={{ width:16, height:16, flexShrink:0 }}/>
            <span>Target allocations sum to <strong>{targetSum.toFixed(2)}%</strong> — must equal 100%. Fix in Settings → Assets, or click Normalise.</span>
          </div>
        )}

        {upcomingDcaChange && (
          <div className="banner banner-info" role="status">
            <Icon name="calendar" style={{ width:16, height:16, flexShrink:0 }}/>
            <span>Scheduled DCA change: <strong>{cy}{upcomingDcaChange.amount}/mo</strong> from <strong>{upcomingDcaChange.effectiveFrom}</strong>{upcomingDcaChange.note ? ` — ${upcomingDcaChange.note}` : ""}.</span>
          </div>
        )}

        {/* ── TABS + CONTENT (sidebar layout on wide screens) ── */}
        <div className="pr-layout">
          <nav className="tabs pr-sidebar" role="tablist" aria-label="Navigation">
            {tabs.map((t, i) => (
              <button
                key={i} role="tab" aria-selected={tab === i}
                className={`tab ${tab === i ? "active" : ""}`}
                onClick={() => switchTab(i)}
              >
                <Icon name={t.icon} className="tab-ico"/>
                <span className="tab-full">{t.label}</span>
                <span className="tab-short">{t.short}</span>
              </button>
            ))}
          </nav>

          <div className="content-wrap">
        {/* ── CONTENT ── */}
        <div className={`content${tabTransit ? " content-out" : ""}`} key={displayedTab} role="tabpanel">
          {displayedTab === 0 && (
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
              liveEnabled={state.live.enabled}
              liveRefreshSec={state.live.refreshSec}
              liveLastFetchedAt={state.live.lastFetchedAt}
              liveLoading={liveLoading}
              liveError={liveError}
              liveModel={liveModel}
              onToggleLive={toggleLiveTracking}
              onRefreshLive={refreshLiveData}
              onUpdateLiveRefresh={updateLiveRefreshSec}
              driftAlerts={driftAlerts}
            />
          )}
          {displayedTab === 1 && (
            <PlanTab
              projection={projection}
              dca={state.dca}
              cy={cy}
              onConfirmLock={() => setConfirmLock(true)}
              assets={state.assets}
              total={total}
              showToast={showToast}
              avgDrift={projAvgDrift}
              maxDrift={projMaxDrift}
              aligned={projAligned}
              months={state.projectionMonths}
              cashFree={cashFree}
              onDeployCash={doDeployCash}
              savingsPlan={state.savingsPlan}
              onSaveSavingsPlan={saveSavingsPlan}
            />
          )}
          {displayedTab === 2 && (
            <AnalyticsTab
              history={state.history}
              assets={state.assets}
              cy={cy}
              benchmark={state.benchmark}
              benchLoading={benchLoading}
              onRefreshBenchmark={refreshBenchmark}
              onSetBenchmarkKey={setBenchmarkKey}
              onUpdateYield={updateYield}
            />
          )}
          {displayedTab === 3 && (
            <HistoryTab history={state.history} cy={cy} priceSnapshots={state.priceSnapshots}/>
          )}
        </div>
          </div>{/* content-wrap */}
        </div>{/* pr-layout */}
      </div>

      {/* ── MODALS ── */}
      {settingsOpen && (
        <SettingsModal
          state={state}
          onClose={() => setSettingsOpen(false)}
          onUpdateDca={updateDca}
          onUpdateTheme={t     => setState(s => ({ ...s, theme: t }))}
          onUpdateProjection={v => setState(s => ({ ...s, projectionMonths: sanitizeNum(v, 1, 12, 3) }))}
          onUpdateAsset={updateAsset}
          onAddAsset={addAsset}
          onRemoveAsset={requestRemoveAsset}
          onNormalize={normalizeTargets}
          onExportJSON={() => { exportJSON(state); setState(s => ({ ...s, lastBackupAt: new Date().toISOString() })); showToast("JSON backup downloaded."); }}
          onExportCSV={() => { exportCSV(state.assets, cy); showToast("CSV downloaded."); }}
          onImport={() => fileInputRef.current?.click()}
          onImportBrokerCsv={() => brokerFileInputRef.current?.click()}
          onImportPdf={() => pdfFileInputRef.current?.click()}
          onReset={() => { setSettingsOpen(false); setConfirmReset(true); }}
          targetSum={targetSum}
          targetOk={targetOk}
          showToast={showToast}
          total={total}
          liveEnabled={state.live.enabled}
          onToggleLive={toggleLiveTracking}
          liveRefreshSec={state.live.refreshSec}
          onUpdateLiveRefresh={updateLiveRefreshSec}
          driftThreshold={state.alerts.driftThreshold}
          onUpdateDriftThreshold={(v) => setState(s => ({ ...s, alerts: { ...s.alerts, driftThreshold: sanitizeNum(v, 0.5, 10, 2) } }))}
          alertsEnabled={state.alerts.enabled}
          onToggleAlerts={(enabled) => setState(s => ({ ...s, alerts: { ...s.alerts, enabled } }))}
          brokerImportLog={state.brokerImportLog}
          onAddBackfillMonth={addBackfillMonth}
          onRemoveHistoryEntry={removeHistoryEntry}
          onUpdateReview={updateReview}
          onUpdateIncome={updateIncome}
          onUpdateCash={updateCash}
          onUpdateDcaRule={updateDcaRule}
          onAddScheduleEntry={addDcaScheduleEntry}
          onRemoveScheduleEntry={removeDcaScheduleEntry}
          onApplyScheduledDca={applyScheduledDca}
          liveModel={liveModel}
        />
      )}

      {dcaPickerOpen && (
        <DcaPickerModal
          cy={cy}
          currentValue={state.dca}
          income={state.income}
          onClose={() => setDcaPickerOpen(false)}
          onSave={applyDcaFromPicker}
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

      {pendingRemove && (
        <ConfirmModal
          icon="close"
          iconColor="var(--accent-red)"
          title={`Remove ${pendingRemove.name || pendingRemove.ticker}?`}
          body={`This will remove "${pendingRemove.ticker}" (${cy}${pendingRemove.current.toFixed(2)}) from your portfolio. You can undo this briefly after removal.`}
          confirmLabel="Remove Asset"
          danger
          onCancel={cancelRemoveAsset}
          onConfirm={confirmRemoveAsset}
        />
      )}

      {cmdOpen && (
        <CommandPalette
          tabs={tabs}
          assets={state.assets}
          onClose={() => setCmdOpen(false)}
          onTabSelect={(i) => { switchTab(i); }}
          onToggleTheme={() => setState(s => {
            const cycle = { auto:"light", light:"dark", dark:"auto" };
            return { ...s, theme: cycle[s.theme] || "auto" };
          })}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
    </div>
  );
}

// ─── THEME TOGGLE ─────────────────────────────────────────────
function ThemeToggle({ theme, onToggle }) {
  const cycle   = { auto:"light", light:"dark", dark:"auto" };
  const iconMap = { auto:"auto", light:"sun", dark:"moon" };
  const labels  = { auto:"Auto", light:"Light", dark:"Dark" };
  const next    = cycle[theme];
  return (
    <button
      className="theme-btn"
      onClick={() => onToggle(next)}
      title={`Theme: ${labels[theme]} → ${labels[next]}`}
      aria-label={`Theme is ${labels[theme]}. Click to switch to ${labels[next]}.`}
    >
      <Icon name={iconMap[theme]} style={{ width:14, height:14 }}/>
      <span className="theme-label">{labels[theme]}</span>
    </button>
  );
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────
// How old a quote may get before the values on screen stop deserving the word "live".
// Three refresh cycles, floored at five minutes so a 15-second setting doesn't nag.
function quoteFreshness(liveEnabled, lastFetchedAt, refreshSec, nowMs) {
  if (!liveEnabled || !lastFetchedAt) return { stale: false, ageSec: null };
  const ageSec = Math.max(0, Math.round((nowMs - new Date(lastFetchedAt).getTime()) / 1000));
  if (!isFinite(ageSec)) return { stale: false, ageSec: null };
  return { stale: ageSec > Math.max(refreshSec * 3, 300), ageSec };
}

function ageLabel(sec) {
  if (sec == null) return "";
  if (sec < 90) return `${sec}s ago`;
  if (sec < 5400) return `${Math.round(sec / 60)} min ago`;
  if (sec < 172800) return `${Math.round(sec / 3600)} h ago`;
  return `${Math.round(sec / 86400)} d ago`;
}

function OverviewTab({ sortedDrift, enriched, safetyBreach, cy, editOpen, setEditOpen, onUpdateCurrent, assets, liveEnabled, liveRefreshSec, liveLastFetchedAt, liveLoading, liveError, liveModel, onToggleLive, onRefreshLive, onUpdateLiveRefresh, driftAlerts }) {
  // Ticks only while live tracking is on, so a stale badge appears without a refresh.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!liveEnabled) return;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [liveEnabled]);

  const freshness = quoteFreshness(liveEnabled, liveLastFetchedAt, liveRefreshSec, nowMs);

  // Where each row's number actually came from. A value that looks live but is really a
  // manual figure nudged by today's percentage move is the failure mode worth naming.
  const provenance = useMemo(() => {
    const map = new Map();
    if (!liveEnabled || !liveModel) return map;
    for (const row of liveModel.rows || []) {
      if (row.quotePrice == null) map.set(row.ticker, "noprice");
      else if (!row.holdingsComputed) map.set(row.ticker, "manual");
    }
    return map;
  }, [liveEnabled, liveModel]);

  const manualCount = useMemo(
    () => [...provenance.values()].filter(v => v === "manual").length,
    [provenance],
  );
  const [localVals, setLocalVals] = useState({});

  useEffect(() => {
    // Intentionally keyed on editOpen only: re-initializing on every `assets` change
    // (e.g. a live price refresh every ~60s) would wipe out values you're mid-typing.
    if (editOpen) {
      const init = {};
      assets.forEach(a => { init[a.ticker] = String(a.current); });
      setLocalVals(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen]);

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
      <Sh title="Live Tracking" subtitle="Realtime PnL, quote health, and drift alerts"/>
      <div className="live-panel">
        <div className="live-top-row">
          <label className="live-toggle">
            <input type="checkbox" checked={liveEnabled} onChange={e => onToggleLive(e.target.checked)} />
            <span>Live tracking</span>
          </label>
          <div className="live-controls">
            <span className="live-label">Refresh</span>
            <input
              className="editor-inp mono live-refresh-inp"
              type="number"
              min="15"
              max="3600"
              step="15"
              value={liveRefreshSec}
              onChange={e => onUpdateLiveRefresh(e.target.value)}
              aria-label="Live refresh interval seconds"
            />
            <span className="live-label">sec</span>
            <button className="btn-ghost sm" onClick={() => onRefreshLive()} disabled={liveLoading || !liveEnabled}>
              <Icon name="refresh" style={{ width:12, height:12 }}/>{liveLoading ? "Refreshing" : "Refresh"}
            </button>
          </div>
          {liveEnabled && (
            <div className="live-last-updated mono" style={freshness.stale ? { color:"var(--accent-amber)" } : undefined}>
              {liveLastFetchedAt
                ? `Last updated: ${new Date(liveLastFetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${ageLabel(freshness.ageSec)}`
                : liveLoading ? "Fetching…" : "Not yet fetched"}
            </div>
          )}
        </div>

        {liveError && <div className="live-error">{liveError}</div>}

        {liveEnabled && liveModel && (
          <>
            <div className="live-meta mono">
              Sources: {Object.entries(liveModel.providerHealth || {}).filter(([, v]) => v === "ok").map(([k]) => k).join(", ") || "none"}
              {liveModel.unresolved?.length ? ` · No price: ${liveModel.unresolved.join(", ")}` : ""}
            </div>
            <div className="live-kpis">
              <div className="live-kpi">
                <span>Live Value</span>
                <strong className="mono">{cy}{Math.round(liveModel.totalLive).toLocaleString()}</strong>
              </div>
              <div className="live-kpi">
                <span>Daily PnL</span>
                <strong className="mono" style={{ color: liveModel.dailyPnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                  {liveModel.dailyPnl >= 0 ? "+" : ""}{cy}{Math.round(liveModel.dailyPnl).toLocaleString()} ({liveModel.dailyPnlPct.toFixed(2)}%)
                </strong>
              </div>
              <div className="live-kpi">
                <span>Total Return</span>
                <strong className="mono" style={{ color: liveModel.totalReturn >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                  {liveModel.totalReturn >= 0 ? "+" : ""}{cy}{Math.round(liveModel.totalReturn).toLocaleString()} ({liveModel.totalReturnPct.toFixed(2)}%)
                </strong>
              </div>
            </div>

            <div className="live-contrib-list">
              {liveModel.contributions.slice(0, 4).map(c => (
                <div key={c.ticker} className="live-contrib-row">
                  <span>{c.ticker}</span>
                  <span className="mono" style={{ color: c.dailyPnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                    {c.dailyPnl >= 0 ? "+" : ""}{cy}{Math.round(c.dailyPnl)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {!!driftAlerts.length && (
        <div className="smart-alerts" role="alert">
          <div className="smart-alert-title">
            <Icon name="warning" style={{ width:14, height:14, color:"var(--accent-amber)" }}/>Smart Drift Alerts
          </div>
          <div className="smart-alert-list">
            {driftAlerts.slice(0, 6).map(a => (
              <div className="smart-alert-row" key={a.ticker}>
                <span className="mono">{a.ticker}</span>
                <span>Drift {a.drift > 0 ? "+" : ""}{a.drift.toFixed(2)}%</span>
                <span className="mono">Suggest buy: {a.suggestedBuy > 0 ? `${cy}${a.suggestedBuy}` : "pause buys"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category breakdown — high-level view first */}
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

      {/* Current Drift — per-asset detail */}
      <Sh title="Current Drift" subtitle="Sorted by value, largest first"/>

      <HowTo title="Where each value comes from, and when to distrust it">
        <p>A row&apos;s value can reach you three ways, and the app labels the weak ones rather than letting them
        look live:</p>
        <HowToSteps>
          <li><strong>Units × live price</strong> — the real thing. You get this once a unit count is set for the
          position and its symbol resolves to a quote.</li>
          <li><strong>Manual, nudged</strong> — no unit count, so the app takes the value you typed and moves it by
          today&apos;s percentage change. Close enough day to day, wrong after a few weeks.</li>
          <li><strong className="d-src-inline">no price</strong> — the symbol resolved to nothing at all. That row is
          frozen at whatever you last entered.</li>
        </HowToSteps>
        <p>The banner above the list shows how old the last successful price fetch is. Anything over a few minutes
        past your refresh interval is called out.</p>
        <HowToTip>To upgrade a row to true live valuation, open <strong>Update Values</strong> below, or Settings →
        Assets, and enter the unit count you actually hold. Everything downstream — drift, P&amp;L, the allocator —
        gets sharper at once.</HowToTip>
        <HowToTip warn>A <strong>no price</strong> badge that never clears usually means the ticker symbol needs
        fixing rather than the data provider being down. European ETFs are the usual culprits.</HowToTip>
      </HowTo>

      {freshness.stale && (
        <div className="banner banner-warn" role="alert">
          <Icon name="warning" style={{ width:16, height:16, flexShrink:0 }}/>
          <span>Prices last updated <strong>{ageLabel(freshness.ageSec)}</strong>. The values below are not current.</span>
          <button className="btn-ghost sm" onClick={() => onRefreshLive()} disabled={liveLoading} style={{ marginLeft:"auto", flexShrink:0 }}>
            <Icon name="refresh" style={{ width:12, height:12 }}/>{liveLoading ? "Refreshing" : "Refresh now"}
          </button>
        </div>
      )}

      {manualCount > 0 && (
        <div className="banner banner-info" role="status">
          <Icon name="info" style={{ width:16, height:16, flexShrink:0 }}/>
          <span>
            <strong>{manualCount} position{manualCount === 1 ? " has" : "s have"} no unit count</strong>, so {manualCount === 1 ? "its value moves" : "their values move"} only
            by today&apos;s percentage change rather than units × price. Set units in Update Values for true live valuation.
          </span>
        </div>
      )}

      {liveEnabled && liveModel?.unresolved?.length > 0 && (
        <div className="banner banner-warn" role="alert">
          <Icon name="warning" style={{ width:16, height:16, flexShrink:0 }}/>
          <span>
            No live price for <strong>{liveModel.unresolved.slice(0, 6).join(", ")}</strong>
            {liveModel.unresolved.length > 6 ? ` +${liveModel.unresolved.length - 6} more` : ""} — those rows show the last value you entered by hand.
          </span>
        </div>
      )}
      <div className="drift-list" role="list">
        {sortedDrift.map((a, i) => {
          const c    = CAT_COLORS[a.cat] || "#6366f1";
          const ad   = Math.abs(a.drift);
          const barW = Math.min((ad / 6) * 55, 55);
          const neg  = a.drift < 0;
          const urg  = ad > 3 ? "var(--accent-red)" : ad > 1.5 ? "var(--accent-amber)" : "var(--accent-green)";
          const src  = provenance.get(a.ticker) || null;
          return (
            <div key={a.ticker} className="d-row" role="listitem" style={{ animationDelay:`${i * 0.035}s` }}>
              <div className="d-left">
                <div className="d-icon" style={{ background:`${c}18`, color:c }}>
                  <Icon name={a.icon}/>
                </div>
                <div className="d-info">
                  <div className="d-ticker">
                    {a.name} <span className="d-tick-paren">({a.ticker})</span>
                    {src === "noprice" && (
                      <span
                        className="d-src d-src-off"
                        title="No live quote resolved for this symbol — the value shown is what you last entered."
                      >
                        no price
                      </span>
                    )}
                  </div>
                  <div className="d-cat">{a.cat}</div>
                </div>
              </div>
              <div className="d-val-cell">
                <div className="d-val mono">{cy}{Math.round(a.current).toLocaleString()}</div>
                {a.sinceBuyPct != null && (
                  <div className="d-sincebuy mono" style={{ color: a.sinceBuyPct >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                    {a.sinceBuyPct >= 0 ? "▲" : "▼"} {Math.abs(a.sinceBuyPct).toFixed(2)}%
                  </div>
                )}
              </div>
              <div className="d-bar-area" aria-hidden="true">
                <div className="d-bar-mid"/>
                <div className={`d-bar ${neg ? "d-bar-neg" : "d-bar-pos"}`}
                  style={{ [neg ? "right" : "left"]:"50%", width:`${barW}%`, animationDelay:`${i * 0.04}s` }}/>
              </div>
              <DriftCell drift={a.drift}/>
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

      {/* Live value editor */}
      <div className="editor-panel">
        <button className="editor-hdr" onClick={() => setEditOpen(v => !v)} aria-expanded={editOpen}>
          <div className="editor-hdr-l">
            <Icon name="edit" style={{ width:15, height:15, color:"var(--accent-indigo)" }}/>
            <span className="editor-hdr-title">Update Values</span>
            <span className="editor-hint">Enter your real {PLATFORM_NAME} values after each session</span>
          </div>
          <div className={`chevron ${editOpen ? "open" : ""}`} aria-hidden="true">▾</div>
        </button>
        {editOpen && (
          <div className="editor-body">
            <div className="editor-grid">
              {[...assets].sort((a, b) => b.current - a.current).map(a => {
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

// ─── SAVINGS PLAN SYNC ─────────────────────────────────────────
// The gap in the app's advice: the allocator recomputes a gap-weighted split every month,
// but a Trade Republic savings plan executes one fixed split until you change it. This
// card turns today's allocation into a fixed split you can paste into the broker, records
// what you set, and then tells you when the two have parted company.
function SavingsPlanCard({ assets, total, dca, cy, plan, onSavePlan, showToast }) {
  const [copied, setCopied] = useState(false);
  const proposed = useMemo(() => savingsPlanSplit(assets, total, dca), [assets, total, dca]);
  const stored = plan?.rows?.length ? plan.rows : null;
  const drift = useMemo(
    () => (stored ? savingsPlanDrift(stored, assets, total, dca) : null),
    [stored, assets, total, dca],
  );
  // The stored plan was set for a different monthly amount — that alone makes it wrong.
  const amountChanged = stored && plan.monthly > 0 && Math.round(plan.monthly) !== Math.round(dca);
  const needsRetune = amountChanged || (drift != null && drift >= 15);

  const asText = proposed.map(r => `${r.ticker}  ${cy}${r.amount}`).join("\n");

  function doCopy() {
    copyToClipboard(`Trade Republic savings plans — ${cy}${Math.round(dca)}/month\n${asText}`)
      .then(() => { setCopied(true); showToast("Savings plan split copied"); setTimeout(() => setCopied(false), 1800); })
      .catch(() => showToast("Copy failed — select the values manually", "error"));
  }

  if (!proposed.length) return null;

  return (
    <div className="sp-panel">
      <div className="sp-head">
        <div>
          <div className="sp-title">
            <Icon name="calendar" style={{ width:15, height:15, color:"var(--accent-indigo)" }}/>
            Savings plan split
            {stored && !needsRetune && <span className="sp-badge sp-ok">in sync</span>}
            {needsRetune && <span className="sp-badge sp-warn">re-tune</span>}
            {!stored && <span className="sp-badge sp-none">not recorded</span>}
          </div>
          <div className="sp-sub">
            A savings plan is a fixed split; the monthly plan is gap-weighted. This is today&apos;s
            allocation expressed as fixed amounts totalling <strong>{cy}{Math.round(dca)}</strong>.
          </div>
        </div>
        <div className="sp-actions">
          <button className="btn-ghost sm" onClick={doCopy}>
            <Icon name={copied ? "check" : "copy"} style={{ width:12, height:12 }}/>{copied ? "Copied" : "Copy"}
          </button>
          <button className="btn-primary sm" onClick={() => onSavePlan(proposed, dca)}>
            <Icon name="check" style={{ width:12, height:12 }}/>{stored ? "Update record" : "I set this up"}
          </button>
        </div>
      </div>

      <div className="sp-rows">
        {proposed.map(r => {
          const was = stored?.find(x => x.ticker === r.ticker)?.amount;
          const delta = was != null ? r.amount - was : null;
          return (
            <div key={r.ticker} className="sp-row">
              <span className="sp-row-t">{r.ticker}</span>
              <span className="sp-row-bar">
                <span className="sp-row-bar-f" style={{ width:`${Math.max(3, (r.amount / Math.max(1, proposed[0].amount)) * 100)}%` }}/>
              </span>
              <span className="mono sp-row-amt">{cy}{r.amount}</span>
              <span className="mono sp-row-delta" style={{ color: !delta ? "var(--text4)" : delta > 0 ? "var(--accent-green)" : "var(--accent-amber)" }}>
                {delta == null ? "new" : delta === 0 ? "—" : `${delta > 0 ? "+" : "−"}${cy}${Math.abs(delta)}`}
              </span>
            </div>
          );
        })}
        {stored?.filter(r => !proposed.some(p => p.ticker === r.ticker)).map(r => (
          <div key={r.ticker} className="sp-row sp-row-drop">
            <span className="sp-row-t">{r.ticker}</span>
            <span className="sp-row-bar"/>
            <span className="mono sp-row-amt">{cy}0</span>
            <span className="mono sp-row-delta" style={{ color:"var(--accent-red)" }}>stop</span>
          </div>
        ))}
      </div>

      <HowTo title="How to use this with Trade Republic">
        <p>Trade Republic executes a <strong>fixed</strong> split every month — the same euros into the same tickers
        until you change it. This app allocates <strong>gap-weighted</strong>: it buys whatever is furthest below
        target, which moves as prices move. Those two drift apart, and this card is the bridge.</p>
        <HowToSteps>
          <li>Press <strong>Copy</strong> to take the list above.</li>
          <li>In {PLATFORM_NAME}, set one savings plan per ticker for those amounts, all on the same execution day.</li>
          <li>Come back and press <strong>I set this up</strong>. The app records what you actually configured.</li>
          <li>Whenever the badge turns <strong>re-tune</strong>, repeat — the recorded split has fallen out of step.</li>
        </HowToSteps>
        <p>The right-hand column compares the proposal against your recorded plan: <strong>+{cy}29</strong> means
        increase that plan, <strong>new</strong> means create one, <strong>stop</strong> means cancel it.</p>
        <HowToTip>Re-tune roughly quarterly rather than monthly. Chasing the allocator every month means constant
        fiddling in the broker for a fraction of a percent of drift.</HowToTip>
        <HowToTip warn>The badge also flips when your monthly contribution changes — the old split still totals the
        old amount, so the whole thing needs redoing, not just adjusting.</HowToTip>
      </HowTo>

      <div className="sp-foot">
        {!stored
          ? <>Nothing recorded yet. Set these amounts in {PLATFORM_NAME}, then press <strong>I set this up</strong> so the app can tell you when they go stale.</>
          : amountChanged
            ? <>Recorded for <strong>{cy}{Math.round(plan.monthly)}/month</strong>, but your contribution is now <strong>{cy}{Math.round(dca)}</strong>. The split needs redoing.</>
            : needsRetune
              ? <>Your recorded plan is <strong>{drift.toFixed(0)}% away</strong> from what the allocator would set up today. Worth re-tuning in {PLATFORM_NAME}.</>
              : <>Recorded {plan.setAt ? new Date(plan.setAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) : "recently"} and still within <strong>{drift.toFixed(0)}%</strong> of today&apos;s allocation. No action needed.</>}
      </div>
    </div>
  );
}

// ─── PLAN TAB (month stepper + N-month outlook) ────────────────
// One-off lump-sum deployment of idle cash, as opposed to the recurring monthly DCA.
// Uses the same gap-weighted allocator, so a big deposit lands on whatever is most
// under-weight rather than being spread evenly.
function DeployCashPanel({ assets, total, cashFree, cy, onDeploy, showToast }) {
  // Default to every euro of free cash and re-track it whenever the balance changes, so
  // the panel always opens on "deploy everything" without being capped there — you can
  // type any amount, including more than the recorded balance.
  const [budget, setBudget] = useState(() => Math.round(cashFree));
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (!touched) setBudget(Math.round(cashFree)); }, [cashFree, touched]);

  const amount = sanitizeNum(budget, 0, 10_000_000, 0);
  const buys = useMemo(() => allocate(assets, total, amount), [assets, total, amount]);
  const spent = buys.reduce((s, b) => s + b.buy, 0);

  if (cashFree < 1) {
    return (
      <div className="deploy-panel">
        <div className="deploy-head">
          <div>
            <div className="deploy-title">Deploy Idle Cash</div>
            <div className="deploy-sub">No free cash right now. Set your balance in Settings → Cashflow → Cash Balance.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="deploy-panel">
      <div className="deploy-head">
        <div>
          <div className="deploy-title">
            <Icon name="wallet" style={{ width:15, height:15, color:"var(--accent-green)" }}/>
            Deploy Idle Cash
          </div>
          <div className="deploy-sub">{cy}{cashFree.toFixed(2)} free to invest — allocated to your most under-weight positions first.</div>
        </div>
        <div className="editor-inp-wrap">
          <span className="editor-sym">{cy}</span>
          <input className="editor-inp mono" type="number" min="0" step="10"
            value={budget}
            onChange={e => { setTouched(true); setBudget(e.target.value); }}
            style={{ width:96 }} aria-label="Amount to deploy"/>
        </div>
      </div>

      {buys.length === 0 ? (
        <div className="deploy-empty">Everything is at or above target — nothing to buy with a lump sum right now.</div>
      ) : (
        <>
          <div className="deploy-list">
            {buys.map(b => {
              const c = CAT_COLORS[b.cat] || "#6366f1";
              const pct = amount > 0 ? (b.buy / amount) * 100 : 0;
              return (
                <div key={b.ticker} className="deploy-row">
                  <div className="d-icon sm" style={{ background:`${c}18`, color:c, flexShrink:0 }}><Icon name={b.icon}/></div>
                  <div className="deploy-row-info">
                    <span className="deploy-row-ticker">{b.ticker}</span>
                    <span className="deploy-row-meta">{b.pct.toFixed(1)}% → {b.target.toFixed(1)}% target</span>
                  </div>
                  <div className="deploy-row-bar"><div className="deploy-row-bar-f" style={{ width:`${pct}%`, background:c }}/></div>
                  <div className="deploy-row-amt mono">{cy}{b.buy}</div>
                </div>
              );
            })}
          </div>
          <div className="deploy-foot">
            <span className="deploy-total mono">
              {cy}{spent} allocated
              {touched && Math.round(cashFree) !== amount && <> · {cy}{Math.round(cashFree)} free</>}
            </span>
            <button className="btn-primary sm" onClick={() => { onDeploy(buys); showToast(`Deployed ${cy}${spent} across ${buys.length} positions`); }}>
              <Icon name="check" style={{ width:13, height:13 }}/>Mark as Bought
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PlanTab({ projection, dca, cy, onConfirmLock, assets, total, showToast, avgDrift, maxDrift, aligned, months, cashFree, onDeployCash, savingsPlan, onSaveSavingsPlan }) {
  const [monthIndex, setMonthIndex] = useState(0);
  const lastIndex = projection.steps.length - 1;
  const clamped = Math.min(monthIndex, Math.max(0, lastIndex));
  const step = projection.steps[clamped];

  if (!step) return null;

  return (
    <>
      <DeployCashPanel
        assets={assets}
        total={total}
        cashFree={cashFree}
        cy={cy}
        onDeploy={onDeployCash}
        showToast={showToast}
      />
      <SavingsPlanCard
        assets={assets}
        total={total}
        dca={dca}
        cy={cy}
        plan={savingsPlan}
        onSavePlan={onSaveSavingsPlan}
        showToast={showToast}
      />
      <div className="plan-stepper">
        <button className="btn-ghost sm" onClick={() => setMonthIndex(i => Math.max(0, i - 1))} disabled={clamped === 0} aria-label="Previous month">
          <Icon name="arrows" style={{ width:13, height:13, transform:"scaleX(-1)" }}/>
        </button>
        <div className="plan-stepper-label mono">Month {clamped + 1} of {projection.steps.length}</div>
        <button className="btn-ghost sm" onClick={() => setMonthIndex(i => Math.min(lastIndex, i + 1))} disabled={clamped === lastIndex} aria-label="Next month">
          <Icon name="arrows" style={{ width:13, height:13 }}/>
        </button>
      </div>
      <MonthTab
        step={step}
        label={`Month ${clamped + 1}`}
        isFirst={clamped === 0}
        dca={dca}
        cy={cy}
        onConfirmLock={onConfirmLock}
        assets={assets}
        total={total}
        showToast={showToast}
      />
      <HealthTab
        finalPort={projection.finalPort}
        finalTotal={projection.finalTotal}
        avgDrift={avgDrift}
        maxDrift={maxDrift}
        aligned={aligned}
        cy={cy}
        months={months}
      />
    </>
  );
}

// ─── MONTH TAB ────────────────────────────────────────────────
function MonthTab({ step, label, isFirst, dca, cy, onConfirmLock, showToast }) {
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
              <div key={`${b.ticker}-${b.buy}`} className="buy-card" style={{ animation:`slideIn 0.4s ease ${i * 0.05}s both` }}>
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

// ─── ANALYTICS ────────────────────────────────────────────────
// Chart palette validated against this app's dark surface (#0a0f1a) with the dataviz
// validator, all pairs: VALUE #3987e5 is the subject, CONTEXT #9aa3b2 is deliberately
// low-chroma context, BENCH #c2762b separates from both (worst normal-vision ΔE 16.5,
// worst CVD ΔE 14.0 protan / 11.7 tritan) with every colour clearing 3:1 contrast.
// Each series also carries a distinct stroke pattern and a direct end label, so identity
// never rests on colour alone. A purple benchmark was tried first and rejected — ΔE 5.1
// against the blue under protanopia.
const VIZ_VALUE = "#3987e5";
const VIZ_CONTEXT = "#9aa3b2";
const VIZ_BENCH = "#c2762b";

function fmtEur(n, cy) {
  return `${cy}${Math.round(n).toLocaleString()}`;
}

// Axis label for a series point: the snapshot's month reads better than "Month 7".
function vizTick(p) {
  if (!p.date) return p.label;
  const d = new Date(p.date);
  if (isNaN(d)) return p.label;
  return `${d.toLocaleDateString("en-GB", { month: "short" })} '${String(d.getFullYear()).slice(2)}`;
}

// Round axis steps (1/2/2.5/5 x 10^n) so ticks read €1,500 rather than €1,478.
function niceStep(span, target) {
  const raw = span / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / mag;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return mult * mag;
}

// The chart draws in real CSS pixels: the viewBox width tracks the container, so an
// 11px axis label is 11px in the wide hero chart and in the narrow bucket cards alike.
// A fixed viewBox would scale text with the container and leave the small cards illegible.
function useMeasuredWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => setWidth(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// Value-vs-invested chart, optionally with a benchmark counterfactual. Single y-scale on
// purpose: every series is in euros, so a second axis would be a lie.
function ProgressChart({ series, cy, height = 260, compact = false, benchLabel = null }) {
  const [hover, setHover] = useState(null);
  const [wrapRef, measured] = useMeasuredWidth();

  if (!series || series.length < 2) {
    return (
      <div className="viz-empty">
        Needs at least two months of history to plot. Lock in a month, or backfill past months from Settings → Data.
      </div>
    );
  }

  const hasBench = !!benchLabel && series.some(p => p.benchmark != null);
  const padL = compact ? 52 : 66;
  const padR = compact ? 14 : 18;
  const padT = 12;
  const padB = 24;
  const W = measured || (compact ? 460 : 900);
  const H = height;
  const innerW = Math.max(40, W - padL - padR);
  const innerH = H - padT - padB;

  const all = series.flatMap(p => [p.value, p.invested, ...(hasBench && p.benchmark != null ? [p.benchmark] : [])]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || Math.max(1, hi * 0.1);
  // Pad the range by a fraction of the span (so the plot fills the box), then draw grid
  // lines only on round multiples inside it. Snapping the range itself to round numbers
  // would leave a third of the chart empty.
  const step = niceStep(span, compact ? 3 : 5);
  const yMin = Math.max(0, lo - span * 0.12);
  const yMax = hi + span * 0.12;

  const x = i => padL + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
  const y = v => padT + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const line = key => series
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p[key] != null)
    .map(({ p, i }, n) => `${n === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`)
    .join(" ");

  // One quad per month rather than one blanket fill: a month that was under water stays
  // red even if the portfolio is in profit today.
  const bands = series.slice(0, -1).map((p, i) => {
    const q = series[i + 1];
    return {
      d: `M${x(i).toFixed(1)},${y(p.value).toFixed(1)} L${x(i + 1).toFixed(1)},${y(q.value).toFixed(1)} `
       + `L${x(i + 1).toFixed(1)},${y(q.invested).toFixed(1)} L${x(i).toFixed(1)},${y(p.invested).toFixed(1)} Z`,
      up: (p.pnl + q.pnl) / 2 >= 0,
    };
  });

  const last = series[series.length - 1];
  const gaining = last.value >= last.invested;
  const gridVals = [];
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) gridVals.push(v);

  const shown = hover != null ? series[hover] : last;
  const aheadOfBench = shown.benchmark != null ? shown.value - shown.benchmark : null;

  return (
    <div className="viz-wrap" ref={wrapRef}>
      <div className="viz-legend">
        <span className="viz-key"><i className="viz-sw-solid" style={{ background: VIZ_VALUE }}/>Value</span>
        <span className="viz-key"><i className="viz-sw-dash" style={{ background: VIZ_CONTEXT }}/>Invested</span>
        {hasBench && <span className="viz-key"><i className="viz-sw-dot" style={{ background: VIZ_BENCH }}/>{benchLabel}</span>}
      </div>
      <svg
        className="viz-svg"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={
          `Portfolio value versus amount invested over ${series.length} points. `
          + `Latest value ${fmtEur(last.value, cy)}, invested ${fmtEur(last.invested, cy)}.`
          + (hasBench && last.benchmark != null ? ` ${benchLabel} counterfactual ${fmtEur(last.benchmark, cy)}.` : "")
        }
        onMouseLeave={() => setHover(null)}
        onMouseMove={e => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((rel - padL) / innerW) * (series.length - 1));
          setHover(Math.max(0, Math.min(series.length - 1, i)));
        }}
      >
        {gridVals.map((v, i) => (
          <g key={i}>
            <line className="viz-grid" x1={padL} x2={W - padR} y1={y(v)} y2={y(v)}/>
            <text className="viz-axis" x={padL - 8} y={y(v) + 4} textAnchor="end">{fmtEur(v, cy)}</text>
          </g>
        ))}

        {bands.map((b, i) => (
          <path key={i} d={b.d} fill={b.up ? "rgba(52,211,153,.16)" : "rgba(239,68,68,.14)"} stroke="none"/>
        ))}
        <path d={line("invested")} fill="none" stroke={VIZ_CONTEXT} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round"/>
        {hasBench && (
          <path d={line("benchmark")} fill="none" stroke={VIZ_BENCH} strokeWidth="2" strokeDasharray="1.5 3.5" strokeLinecap="round" strokeLinejoin="round"/>
        )}
        <path d={line("value")} fill="none" stroke={VIZ_VALUE} strokeWidth="2" strokeLinejoin="round"/>

        {series.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.invested)} r="4" fill={VIZ_CONTEXT} stroke="#0a0f1a" strokeWidth="2"/>
            {hasBench && p.benchmark != null && (
              <circle cx={x(i)} cy={y(p.benchmark)} r="3.5" fill={VIZ_BENCH} stroke="#0a0f1a" strokeWidth="2"/>
            )}
            <circle cx={x(i)} cy={y(p.value)} r="4.5" fill={VIZ_VALUE} stroke="#0a0f1a" strokeWidth="2"/>
          </g>
        ))}

        {hover != null && (
          <g>
            <line className="viz-cross" x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH}/>
            <circle cx={x(hover)} cy={y(series[hover].value)} r="7" fill="none" stroke={VIZ_VALUE} strokeWidth="2"/>
          </g>
        )}

        {series.map((p, i) => {
          // Thin the ticks to what actually fits, so labels never collide in the
          // narrow bucket cards. First and last always survive.
          const room = Math.max(2, Math.floor(innerW / 66));
          const every = Math.ceil((series.length - 1) / (room - 1));
          const keep = i === 0 || i === series.length - 1 || (i % every === 0 && series.length - 1 - i >= every / 2);
          if (!keep) return null;
          return (
            <text key={i} className="viz-axis" x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"}>
              {p.label === "Now" ? "Now" : vizTick(p)}
            </text>
          );
        })}
      </svg>

      <div className="viz-readout">
        <strong>{hover != null ? (shown.label === "Now" ? "Now" : vizTick(shown)) : "Latest"}</strong>
        <span>Value <b style={{ color: VIZ_VALUE }}>{fmtEur(shown.value, cy)}</b></span>
        <span>Invested <b style={{ color: VIZ_CONTEXT }}>{fmtEur(shown.invested, cy)}</b></span>
        <span>P&amp;L <b style={{ color: shown.pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
          {shown.pnl >= 0 ? "+" : "−"}{fmtEur(Math.abs(shown.pnl), cy)}
        </b></span>
        {aheadOfBench != null && (
          <span>vs {benchLabel} <b style={{ color: aheadOfBench >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
            {aheadOfBench >= 0 ? "+" : "−"}{fmtEur(Math.abs(aheadOfBench), cy)}
          </b></span>
        )}
        {hover == null && !gaining && <span className="viz-note">Below cost</span>}
      </div>
    </div>
  );
}

function BucketCard({ title, subtitle, series, cy }) {
  const last = series[series.length - 1];
  const pct = last && last.invested > 0 ? (last.pnl / last.invested) * 100 : null;
  return (
    <div className="viz-card">
      <div className="viz-card-head">
        <div>
          <div className="viz-card-title">{title}</div>
          <div className="viz-card-sub">{subtitle}</div>
        </div>
        {last && (
          <div className="viz-card-stat">
            <div className="viz-card-val mono">{fmtEur(last.value, cy)}</div>
            {pct != null && (
              <div className="viz-card-pnl mono" style={{ color: pct >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
              </div>
            )}
          </div>
        )}
      </div>
      <ProgressChart series={series} cy={cy} height={190} compact/>
    </div>
  );
}

// Expected distribution income. Yields are entered by hand — nothing in the free market
// data tier reports them reliably — so the card says so rather than implying it is live.
function DividendCard({ assets, cy, onUpdateYield }) {
  const [open, setOpen] = useState(false);
  const income = useMemo(() => dividendIncome(assets), [assets]);
  const editable = useMemo(() => [...assets].sort((a, b) => (b.yieldPct ?? -1) - (a.yieldPct ?? -1)), [assets]);

  return (
    <div className="viz-card div-card">
      <div className="viz-card-head">
        <div>
          <div className="viz-card-title">Expected annual income</div>
          <div className="viz-card-sub">
            {income.coveredCount > 0
              ? `From ${income.coveredCount} paying position${income.coveredCount === 1 ? "" : "s"} at the yields you entered`
              : "No yields entered yet"}
          </div>
        </div>
        <button className="btn-ghost sm" onClick={() => setOpen(v => !v)} aria-expanded={open}>
          <Icon name="edit" style={{ width:12, height:12 }}/>{open ? "Done" : "Yields"}
        </button>
      </div>

      {income.coveredCount === 0 ? (
        <div className="viz-empty">Enter an annual yield for your paying positions to see expected income.</div>
      ) : (
        <>
          <div className="div-kpis">
            <div className="div-kpi">
              <span>Gross</span>
              <strong className="mono">{cy}{income.gross.toFixed(0)}</strong>
            </div>
            <div className="div-kpi">
              <span>After withholding</span>
              <strong className="mono" style={{ color:"var(--accent-green)" }}>{cy}{income.net.toFixed(0)}</strong>
            </div>
            <div className="div-kpi">
              <span>Lost at source</span>
              <strong className="mono" style={{ color: income.withheld > 0 ? "var(--accent-red)" : undefined }}>
                {income.withheld > 0 ? "−" : ""}{cy}{income.withheld.toFixed(0)}
              </strong>
            </div>
            <div className="div-kpi">
              <span>Yield on portfolio</span>
              <strong className="mono">{income.yieldOnPortfolioPct.toFixed(2)}%</strong>
            </div>
          </div>

          <div className="div-rows">
            {income.rows.map(r => (
              <div key={r.ticker} className="div-row">
                <span className="div-row-name">
                  {r.name} <span className="d-tick-paren">({r.ticker})</span>
                  {r.ucits
                    ? <span className="div-tag div-tag-ok" title="EU/EEA UCITS — distributions are exempt for a Greek tax resident">UCITS</span>
                    : <span className="div-tag div-tag-wh" title={`Non-UCITS — ${US_WITHHOLDING_PCT}% withheld at source and not recoverable`}>−{US_WITHHOLDING_PCT}%</span>}
                </span>
                <span className="mono div-row-y">{r.yieldPct.toFixed(2)}%</span>
                <span className="mono div-row-amt">{cy}{r.net < 10 ? r.net.toFixed(1) : r.net.toFixed(0)}</span>
              </div>
            ))}
          </div>

          <HowTo title="How this estimate is built, and where to find the yields">
            <p>The app has no reliable free source for distribution yields, so you enter them and it does the
            arithmetic. Press <strong>Yields</strong> above to edit them inline.</p>
            <HowToSteps>
              <li>Look up each holding&apos;s <strong>trailing 12-month distribution yield</strong> — the fund&apos;s
              own factsheet, or the position page in {PLATFORM_NAME}.</li>
              <li>Enter it as a percentage. <strong>Zero is a real answer</strong> for an accumulating ETF, which
              reinvests internally and distributes nothing; leave the box empty only if you genuinely don&apos;t know.</li>
              <li>Tick <strong>UCITS</strong> for EU/EEA-domiciled funds.</li>
            </HowToSteps>
            <p>That tick is what drives the tax column. A UCITS fund&apos;s distributions reach you whole; a US share
            loses {US_WITHHOLDING_PCT}% at source before you ever see it, and that portion is gone for good.</p>
            <HowToTip>Yield on portfolio is the honest headline: income measured against <em>everything</em> you own,
            including the positions paying nothing.</HowToTip>
            <HowToTip warn>This is a forward estimate at today&apos;s values, not a record of what you were paid.
            Companies cut dividends, and fund distributions vary quarter to quarter.</HowToTip>
          </HowTo>

          <div className="div-foot">
            An estimate from the yields entered below, at today&apos;s values. UCITS funds keep the whole
            distribution; US shares lose {US_WITHHOLDING_PCT}% at source.
          </div>
        </>
      )}

      {open && (
        <div className="div-edit">
          {editable.map(a => (
            <label key={a.ticker} className="div-edit-row">
              <span className="div-edit-t">{a.ticker}</span>
              <span className="editor-inp-wrap div-edit-inp">
                <input
                  className="editor-inp mono"
                  type="number" inputMode="decimal" min="0" max="100" step="0.01"
                  placeholder="—"
                  value={a.yieldPct != null ? String(a.yieldPct) : ""}
                  onChange={e => onUpdateYield(a.ticker, e.target.value)}
                  aria-label={`Annual yield percent for ${a.ticker}`}
                />
                <span className="editor-sym">%</span>
              </span>
              <label className="div-edit-ucits">
                <input
                  type="checkbox"
                  checked={!!a.ucits}
                  onChange={e => onUpdateYield(a.ticker, a.yieldPct, e.target.checked)}
                  aria-label={`${a.ticker} is an EU UCITS fund`}
                />
                UCITS
              </label>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const BENCH_STATUS_TEXT = {
  no_api_key: "No market-data API key is set on the server, so historical prices can't be fetched.",
  symbol_unresolved: "The data provider returned no series for this benchmark's symbol.",
  empty_series: "The data provider returned no usable monthly closes.",
  fetch_failed: "The request for historical prices failed.",
};

function AnalyticsTab({ history, assets, cy, benchmark, benchLoading, onRefreshBenchmark, onSetBenchmarkKey, onUpdateYield }) {
  const all    = useMemo(() => buildMonthlySeries(history, assets, "all"), [history, assets]);
  const crypto = useMemo(() => buildMonthlySeries(history, assets, "crypto"), [history, assets]);
  const rest   = useMemo(() => buildMonthlySeries(history, assets, "rest"), [history, assets]);
  const contribs = useMemo(() => monthlyContributions(history, "all"), [history]);

  const benchKey = benchmark?.key || "VWCE";
  const benchName = BENCHMARK_OPTIONS.find(o => o.key === benchKey)?.label || benchKey;
  const bench = useMemo(
    () => (benchmark?.closes ? benchmarkSeries(all, benchmark.closes) : null),
    [all, benchmark?.closes],
  );
  const heroSeries = bench?.points || all;

  const irrAnnual = useMemo(() => seriesIrr(all), [all]);
  const last = all[all.length - 1];
  const pnlPct = last && last.invested > 0 ? (last.pnl / last.invested) * 100 : null;
  const totalContrib = contribs.reduce((s, c) => s + (c.amount || 0), 0);
  const benchLast = heroSeries[heroSeries.length - 1]?.benchmark ?? null;

  if (!all.length) {
    return (
      <>
        <Sh title="Analytics" subtitle="Progress over time"/>
        <div className="empty-state" style={{ marginTop:40 }}>
          <Icon name="barChart" style={{ width:40, height:40, color:"var(--text3)", marginBottom:12 }}/>
          <p>No data to chart yet.<br/>Lock in a month on the Plan tab, or backfill past months from Settings → Data.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Sh title="Analytics" subtitle="Value against money actually invested, month by month"/>

      <HowTo title="How to read these charts">
        <p>Every chart on this page plots two euro lines against one scale. The <strong>solid blue</strong> line is
        what the portfolio was worth. The <strong>dashed grey</strong> line is what you had put in by that point.
        The gap between them is your unrealised profit or loss.</p>
        <p>That gap is shaded <strong>per month</strong>, not once for the whole chart: a month that was under water
        stays red even while you are in profit today. Hover anywhere to read the exact figures for that month.</p>
        <p>Points come from months you locked in, plus any you backfilled, plus a final <strong>Now</strong> point
        taken from your live portfolio. The two smaller charts split the same data into crypto and everything else,
        because those two behave nothing alike and averaging them hides both.</p>
        <HowToTip><strong>Return (IRR)</strong> above is money-weighted and annualised — it accounts for when each
        contribution arrived, unlike a plain since-buy percentage.</HowToTip>
        <HowToTip warn>A chart needs two points to draw. If a bucket is empty, that month had nothing recorded for
        it — a backfilled month without a crypto figure, most likely.</HowToTip>
      </HowTo>

      <div className="viz-kpis">
        <div className="viz-kpi">
          <span>Invested</span>
          <strong className="mono">{fmtEur(last.invested, cy)}</strong>
        </div>
        <div className="viz-kpi">
          <span>Value</span>
          <strong className="mono" style={{ color: VIZ_VALUE }}>{fmtEur(last.value, cy)}</strong>
        </div>
        <div className="viz-kpi">
          <span>Unrealised P&amp;L</span>
          <strong className="mono" style={{ color: last.pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
            {last.pnl >= 0 ? "+" : "−"}{fmtEur(Math.abs(last.pnl), cy)}{pnlPct != null ? ` (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)` : ""}
          </strong>
        </div>
        <div className="viz-kpi">
          <span>Return (IRR)</span>
          <strong className="mono" style={{ color: irrAnnual == null ? "var(--text3)" : irrAnnual >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
            {irrAnnual != null ? `${irrAnnual >= 0 ? "+" : "−"}${Math.abs(irrAnnual * 100).toFixed(1)}%` : "—"}
          </strong>
        </div>
      </div>

      <div className="viz-main">
        <div className="viz-main-head">
          <div className="viz-main-title">Portfolio against {benchName}</div>
          <div className="viz-bench-ctl">
            <select
              className="select-inp"
              value={benchKey}
              onChange={e => onSetBenchmarkKey(e.target.value)}
              aria-label="Benchmark instrument"
            >
              {BENCHMARK_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button className="btn-ghost sm" onClick={() => onRefreshBenchmark(benchKey)} disabled={benchLoading}>
              <Icon name="refresh" style={{ width:12, height:12 }}/>{benchLoading ? "Loading" : benchmark?.closes ? "Update" : "Load prices"}
            </button>
          </div>
        </div>

        <ProgressChart series={heroSeries} cy={cy} benchLabel={bench ? benchName : null}/>

        {bench && benchLast != null && last && (
          <div className={`viz-verdict ${last.value >= benchLast ? "ahead" : "behind"}`}>
            <Icon name={last.value >= benchLast ? "trendUp" : "warning"} style={{ width:14, height:14, flexShrink:0 }}/>
            <span>
              Your picks are <strong>{last.value >= benchLast ? "ahead of" : "behind"} {benchName}</strong> by{" "}
              <strong className="mono">{fmtEur(Math.abs(last.value - benchLast), cy)}</strong>
              {last.invested > 0 && ` (${((Math.abs(last.value - benchLast) / last.invested) * 100).toFixed(1)}% of money invested)`}
              {" "}— same contributions, same dates, all into {benchName} instead.
            </span>
          </div>
        )}

        {bench && !bench.complete && (
          <div className="viz-note-row">
            {bench.missing} month{bench.missing === 1 ? "" : "s"} had no benchmark price, so those contributions bought
            nothing in the comparison. Prices are never interpolated — the line understates the benchmark rather than guessing.
          </div>
        )}

        <HowTo title="What the benchmark line is actually showing">
          <p>It answers one question: <strong>what if every euro you contributed had gone into a single index fund
          instead?</strong> Same amounts, same dates, no stock picking. The dotted amber line is that alternative
          portfolio; where your blue line sits relative to it is what your selection has earned or cost you.</p>
          <HowToSteps>
            <li>Choose the benchmark from the dropdown — a global fund (VWCE) or US large-cap (CSPX).</li>
            <li>Press <strong>Load prices</strong> once. Monthly closes are cached, so it is not a per-visit fetch.</li>
            <li>Read the verdict line under the chart for the euro difference.</li>
          </HowToSteps>
          <p>Contributions buy benchmark units at that month&apos;s closing price and are never sold, which mirrors
          how you actually invest.</p>
          <HowToTip>This is the single most useful number on the page over multi-year spans — it is the only one that
          tests whether picking individual positions is paying for itself.</HowToTip>
          <HowToTip warn>Six months of it means nothing. Judge it over years, and remember a benchmark you are behind
          may simply be riskier or more concentrated than what you hold.</HowToTip>
        </HowTo>

        {!benchmark?.closes && (
          <div className="viz-note-row">
            {benchmark?.status && BENCH_STATUS_TEXT[benchmark.status]
              ? BENCH_STATUS_TEXT[benchmark.status]
              : `Load ${benchName} monthly closes to see what the same contributions would have been worth in it.`}
          </div>
        )}
      </div>

      <div className="viz-bucket-grid">
        <BucketCard title="Crypto" subtitle="BTC and ETH" series={crypto} cy={cy}/>
        <BucketCard title="Everything else" subtitle="ETFs, stocks" series={rest} cy={cy}/>
      </div>

      <div className="viz-bucket-grid one">
        <DividendCard assets={assets} cy={cy} onUpdateYield={onUpdateYield}/>
      </div>

      {contribs.length > 0 && (
        <>
          <Sh title="Month by month" subtitle={`${fmtEur(totalContrib, cy)} contributed across ${contribs.length} recorded month${contribs.length === 1 ? "" : "s"}`}/>
          <div className="viz-table" role="table">
            <div className="viz-tr viz-th" role="row">
              <span>Month</span><span>Contributed</span><span>Value</span><span>Invested</span><span>P&amp;L</span>
            </div>
            {all.slice(0, contribs.length).map((p, i) => (
              <div className="viz-tr" role="row" key={i}>
                <span>
                  {vizTick(p)}
                  {p.backfilled
                    ? <span className="viz-tr-sub" title="Entered by hand from a past statement">backfilled</span>
                    : <span className="viz-tr-sub">{p.label}</span>}
                </span>
                <span className="mono">{contribs[i]?.amount != null ? fmtEur(contribs[i].amount, cy) : "—"}</span>
                <span className="mono">{fmtEur(p.value, cy)}</span>
                <span className="mono">{fmtEur(p.invested, cy)}</span>
                <span className="mono" style={{ color: p.pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                  {p.pnl >= 0 ? "+" : "−"}{fmtEur(Math.abs(p.pnl), cy)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ─── HISTORY TAB ──────────────────────────────────────────────
function HistoryTab({ history, cy, priceSnapshots = [] }) {
  if (history.length === 0 && priceSnapshots.length === 0) {
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
  const liveTotals = priceSnapshots.map(s => s.totalValue);
  const liveMin = liveTotals.length ? Math.min(...liveTotals) : 0;
  const liveMax = liveTotals.length ? Math.max(...liveTotals) : 0;

  return (
    <>
      <Sh title="Monthly History" subtitle={`${history.length} month${history.length !== 1 ? "s" : ""} tracked`}/>

      {priceSnapshots.length >= 2 && (
        <div className="sparkline-card">
          <div className="spark-label">Live Tracking Trend</div>
          <svg className="sparkline" viewBox={`0 0 ${priceSnapshots.length * 24} 60`} preserveAspectRatio="none" aria-label="Live value trend">
            <polyline
              fill="none"
              stroke="var(--accent-blue)"
              strokeWidth="2"
              strokeLinejoin="round"
              points={liveTotals.map((t, i) => {
                const x = i * 24 + 10;
                const y = liveMax === liveMin ? 30 : 55 - ((t - liveMin) / (liveMax - liveMin)) * 50;
                return `${x},${y}`;
              }).join(" ")}
            />
          </svg>
          <div className="spark-range">
            <span className="mono">{cy}{Math.round(liveMin).toLocaleString()}</span>
            <span className="mono">{cy}{Math.round(liveMax).toLocaleString()}</span>
          </div>
        </div>
      )}

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
// ─── CATEGORY ALLOC ROW ───────────────────────────────────────
function CatAllocRow({ cat, color, assets, currentPct, targetTotal, onSetTarget }) {
  const [draft, setDraft] = useState(targetTotal.toFixed(1));
  // Keep draft in sync when parent state changes (e.g. normalise)
  useEffect(() => { setDraft(targetTotal.toFixed(1)); }, [targetTotal]);

  const commit = () => {
    const val = Math.max(0, Math.min(100, parseFloat(draft) || 0));
    setDraft(val.toFixed(1));
    onSetTarget(val);
  };

  return (
    <div className="cat-alloc-row">
      <div className="cat-alloc-label">
        <div className="cat-alloc-dot" style={{ background: color }}/>
        <Icon name={CAT_ICONS[cat] || "barChart"} style={{ width:14, height:14, color, flexShrink:0 }}/>
        <span className="cat-alloc-name">{cat}</span>
        <span className="cat-alloc-count">{assets.length}</span>
      </div>
      <div className="cat-alloc-assets">
        {assets.map(a => (
          <span key={a.ticker} className="cat-alloc-chip" style={{ background:`${color}18`, color }}>
            {a.ticker}
          </span>
        ))}
      </div>
      <span className="cat-alloc-cur mono">{currentPct.toFixed(1)}%</span>
      <div className="cat-alloc-inp-wrap">
        <input
          className="editor-inp mono cat-alloc-inp"
          type="number" min="0" max="100" step="0.1"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") { commit(); e.target.blur(); } }}
          aria-label={`Target % for ${cat}`}
        />
        <span className="editor-sym">%</span>
      </div>
    </div>
  );
}

function SettingsModal({ state, onClose, onUpdateDca, onUpdateTheme, onUpdateProjection, onUpdateAsset, onAddAsset, onRemoveAsset, onNormalize, onExportJSON, onExportCSV, onImport, onImportBrokerCsv, onImportPdf, onReset, targetSum, targetOk, showToast, liveEnabled, onToggleLive, liveRefreshSec, onUpdateLiveRefresh, driftThreshold, onUpdateDriftThreshold, alertsEnabled, onToggleAlerts, brokerImportLog = [], onUpdateIncome, onUpdateCash, onUpdateDcaRule, onAddScheduleEntry, onRemoveScheduleEntry, onApplyScheduledDca, liveModel, onAddBackfillMonth, onRemoveHistoryEntry, onUpdateReview }) {
  const [section, setSection] = useState("general");
  const [assetsView, setAssetsView] = useState("assets"); // "assets" | "categories"
  const [localDca, setLocalDca] = useState(String(state.dca));
  const modalRef = useRef(null);
  useEffect(() => { modalRef.current?.focus(); }, []);
  useFocusTrap(modalRef);

  // Category targets: redistribute asset targets within a category proportionally
  const setCategoryTarget = (cat, newCatTarget) => {
    const assetsInCat = state.assets.filter(a => a.cat === cat);
    if (!assetsInCat.length) return;
    const currentCatTotal = assetsInCat.reduce((s, a) => s + a.target, 0);
    assetsInCat.forEach(a => {
      // keep relative weight; if current cat total is 0, split evenly
      const share = currentCatTotal > 0 ? a.target / currentCatTotal : 1 / assetsInCat.length;
      onUpdateAsset(a.ticker, "target", String((share * newCatTarget).toFixed(2)));
    });
  };

  // Compute per-category summary from live state
  const catSummary = useMemo(() => {
    const activeCats = CATEGORIES.filter(cat => state.assets.some(a => a.cat === cat));
    return activeCats.map(cat => {
      const assets = state.assets.filter(a => a.cat === cat);
      const targetTotal = assets.reduce((s, a) => s + a.target, 0);
      const currentTotal = assets.reduce((s, a) => s + a.current, 0);
      return { cat, assets, targetTotal, currentTotal };
    });
  }, [state.assets]);

  const TABS = [
    { id:"general",  label:"General",  icon:"sliders" },
    { id:"cashflow", label:"Cashflow", icon:"handDollar" },
    { id:"assets",   label:"Assets",   icon:"layers"  },
    { id:"data",     label:"Data",     icon:"wallet"  },
  ];

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Settings">
      <div className="modal lg-modal" ref={modalRef} tabIndex={-1} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="modal-hdr">
          <div className="modal-hdr-left">
            <div className="modal-hdr-icon" aria-hidden="true">
              <Icon name="sliders" style={{ width:16, height:16 }}/>
            </div>
            <div>
              <h2 className="modal-hdr-title">Settings</h2>
              <p className="modal-hdr-sub">Manage your portfolio preferences</p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            <Icon name="close" style={{ width:14, height:14 }}/>
          </button>
        </div>

        {/* ── Tab bar ── */}
        <div className="modal-tabs" role="tablist">
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={section === t.id}
              className={`modal-tab ${section === t.id ? "active" : ""}`}
              onClick={() => setSection(t.id)}>
              <Icon name={t.icon} style={{ width:13, height:13 }}/>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════ GENERAL ══════════ */}
        {section === "general" && (
          <div key="general" className="modal-body">

            {/* Investment */}
            <div className="settings-group">
              <div className="settings-group-label">Investment</div>
              <div className="settings-card">
                <SettingRow title="Monthly DCA" desc="How much you invest each month">
                  <div className="editor-inp-wrap">
                    <span className="editor-sym">{CURRENCY_SYMBOL}</span>
                    <input className="editor-inp mono" type="number" min="1" max="1000000" step="10"
                      value={localDca}
                      onChange={e => setLocalDca(e.target.value)}
                      onBlur={() => { onUpdateDca(localDca); showToast("DCA updated"); }}
                      onKeyDown={e => { if (e.key === "Enter") { onUpdateDca(localDca); e.target.blur(); }}}
                      style={{ width:90 }} aria-label="Monthly DCA"/>
                  </div>
                </SettingRow>
              </div>
            </div>

            {/* Projection */}
            <div className="settings-group">
              <div className="settings-group-label">Projection</div>
              <div className="settings-card">
                <div className="proj-block proj-block-compact">
                  <div className="proj-block-hdr">
                    <div>
                      <div className="setting-title">Projection Horizon</div>
                      <div className="setting-desc">Simulate the next {state.projectionMonths} month{state.projectionMonths !== 1 ? "s" : ""} of DCA contributions</div>
                    </div>
                    <div className="proj-val-pill mono">{state.projectionMonths}<span>mo</span></div>
                  </div>
                  <div className="proj-slider-wrap">
                    <div className="proj-slider-shell">
                      <input type="range" min="1" max="12" value={state.projectionMonths}
                        onChange={e => onUpdateProjection(e.target.value)}
                        className="proj-slider"
                        style={{ "--pct": `${((state.projectionMonths - 1) / 11) * 100}%` }}
                        aria-label="Projection months"/>
                    </div>
                    <div className="proj-ticks" aria-hidden="true">
                      {[1,3,6,9,12].map(m => (
                        <span key={m} className={`proj-tick${state.projectionMonths >= m ? " hit" : ""}`}>{m}mo</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Automation */}
            <div className="settings-group">
              <div className="settings-group-label">Automation</div>
              <div className="settings-card">
                <SettingRow title="Live Tracking" desc="Fetch live quotes from proxy providers and update PnL automatically">
                  <button className={`seg-btn ${liveEnabled ? "active" : ""}`} onClick={() => onToggleLive(!liveEnabled)}>
                    <Icon name="refresh" style={{ width:12, height:12 }}/>{liveEnabled ? "Enabled" : "Disabled"}
                  </button>
                </SettingRow>
                <SettingDivider/>
                <SettingRow title="Refresh Interval" desc="Polling frequency for live quotes (15 sec – 1 hour). Use higher values to stay within free-tier API limits.">
                  <div className="editor-inp-wrap">
                    <input className="editor-inp mono" type="number" min="15" max="3600" step="15"
                      value={liveRefreshSec}
                      onChange={e => onUpdateLiveRefresh(e.target.value)}
                      style={{ width:64 }} aria-label="Live refresh interval seconds"/>
                    <span className="editor-sym">sec</span>
                  </div>
                </SettingRow>
                <SettingDivider/>
                <SettingRow title="Smart Drift Alerts" desc="Trigger alerts when absolute drift crosses threshold">
                  <div className="editor-inp-wrap">
                    <button className={`seg-btn ${alertsEnabled ? "active" : ""}`} onClick={() => onToggleAlerts(!alertsEnabled)}>
                      {alertsEnabled ? "On" : "Off"}
                    </button>
                    <input className="editor-inp mono" type="number" min="0.5" max="10" step="0.1"
                      value={driftThreshold}
                      onChange={e => onUpdateDriftThreshold(e.target.value)}
                      style={{ width:56 }} aria-label="Drift threshold percentage"/>
                    <span className="editor-sym">%</span>
                  </div>
                </SettingRow>
              </div>
            </div>

            {/* Appearance */}
            <div className="settings-group">
              <div className="settings-group-label">Appearance</div>
              <div className="settings-card">
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
              </div>
            </div>

            {/* Danger zone */}
            <div className="settings-group">
              <div className="settings-group-label">Danger Zone</div>
              <div className="settings-card">
                <SettingRow title="Reset Portfolio" desc="Permanently clear all data and restore sample defaults">
                  <button className="btn-danger sm" onClick={onReset}>
                    <Icon name="trash" style={{ width:13, height:13 }}/>Reset
                  </button>
                </SettingRow>
              </div>
            </div>

          </div>
        )}

        {/* ══════════ CASHFLOW ══════════ */}
        {section === "cashflow" && (
          <CashflowSection
            state={state}
            cy={CURRENCY_SYMBOL}
            onUpdateIncome={onUpdateIncome}
            onUpdateCash={onUpdateCash}
            onUpdateDcaRule={onUpdateDcaRule}
            onUpdateDca={onUpdateDca}
            onAddScheduleEntry={onAddScheduleEntry}
            onRemoveScheduleEntry={onRemoveScheduleEntry}
            onApplyScheduledDca={onApplyScheduledDca}
            showToast={showToast}
          />
        )}

        {/* ══════════ ASSETS ══════════ */}
        {section === "assets" && (
          <div key="assets" className="modal-body">
            {/* Toolbar */}
            <div className="assets-view-toggle">
              <div className="seg-ctrl" role="group" aria-label="Target view">
                <button className={`seg-btn ${assetsView === "assets" ? "active" : ""}`}
                  onClick={() => setAssetsView("assets")}>
                  <Icon name="barChart" style={{ width:12, height:12 }}/>By Asset
                </button>
                <button className={`seg-btn ${assetsView === "categories" ? "active" : ""}`}
                  onClick={() => setAssetsView("categories")}>
                  <Icon name="layers" style={{ width:12, height:12 }}/>By Category
                </button>
              </div>
              <div className="assets-toolbar-right">
                <div className={`target-sum-pill ${targetOk ? "ok" : "err"}`}>
                  <Icon name={targetOk ? "circleCheck" : "warning"} style={{ width:13, height:13 }}/>
                  {targetSum.toFixed(1)}%
                </div>
                <button className="btn-ghost sm" onClick={onNormalize}>
                  <Icon name="normalize" style={{ width:13, height:13 }}/>Normalise
                </button>
              </div>
            </div>

            {/* Per-asset view */}
            {assetsView === "assets" && (
              <>
                <div className="assets-table" role="table">
                  <div className="assets-thead" role="row">
                    <span>Asset</span><span>Category</span><span>Holdings</span><span>Current</span><span>Target %</span><span/>
                  </div>
                  {state.assets.map(a => (
                    <AssetRow key={a.ticker} asset={a}
                      color={CAT_COLORS[a.cat] || "#6366f1"}
                      currency={CURRENCY_SYMBOL}
                      isLive={!!liveModel?.rows?.find(r => r.ticker === a.ticker)?.holdingsComputed}
                      onUpdate={(field, val) => onUpdateAsset(a.ticker, field, val)}
                      onRemove={() => onRemoveAsset(a.ticker)}
                    />
                  ))}
                </div>
                <button className="btn-ghost add-btn" onClick={() => { onAddAsset(); showToast("Asset added — edit its values above."); }}>
                  <Icon name="addAsset" style={{ width:15, height:15 }}/>Add Asset
                </button>
              </>
            )}

            {/* Per-category view */}
            {assetsView === "categories" && (
              <div className="cat-alloc-table">
                <div className="cat-alloc-head">
                  <span>Category</span>
                  <span>Assets</span>
                  <span>Current %</span>
                  <span>Target %</span>
                </div>
                {catSummary.map(({ cat, assets, targetTotal, currentTotal }) => {
                  const c = CAT_COLORS[cat] || "#6366f1";
                  const grandTotal = state.assets.reduce((s, a) => s + a.current, 0);
                  const currentPct = grandTotal > 0 ? (currentTotal / grandTotal) * 100 : 0;
                  return (
                    <CatAllocRow key={cat}
                      cat={cat} color={c} assets={assets}
                      currentPct={currentPct} targetTotal={targetTotal}
                      onSetTarget={val => setCategoryTarget(cat, val)}
                    />
                  );
                })}
                <div className="cat-alloc-foot">
                  <span>Total</span>
                  <span/>
                  <span className="mono">100%</span>
                  <span className={`mono ${targetOk ? "ok-text" : "err-text"}`}>{targetSum.toFixed(1)}%</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════ DATA ══════════ */}
        {section === "data" && (
          <div key="data" className="modal-body">

            {/* Storage stats */}
            <div className="data-stat-grid">
              {[
                { label:"Assets",    val:state.assets.length,          icon:"layers"  },
                { label:"Snapshots", val:state.history.length,         icon:"calendar"},
                { label:"Schema",    val:`v${SCHEMA_VERSION}`,         icon:"info"    },
                { label:"Storage",   val:`${(JSON.stringify(state).length / 1024).toFixed(1)} KB`, icon:"wallet" },
              ].map(({ label, val, icon }) => (
                <div key={label} className="data-stat-card">
                  <div className="data-stat-ico"><Icon name={icon} style={{ width:14, height:14 }}/></div>
                  <div className="data-stat-val mono">{val}</div>
                  <div className="data-stat-lbl">{label}</div>
                </div>
              ))}
            </div>

            {/* Export / Import */}
            <div className="settings-group" style={{ marginTop:20 }}>
              <div className="settings-group-label">Export & Import</div>
              <div className="settings-card">
                <div className="data-action-row">
                  <div className="data-action-info">
                    <div className="setting-title">JSON Backup</div>
                    <div className="setting-desc">Full backup — restores everything including history</div>
                  </div>
                  <button className="btn-ghost" onClick={onExportJSON}>
                    <Icon name="download" style={{ width:14, height:14 }}/>Export
                  </button>
                </div>
                <SettingDivider/>
                <div className="data-action-row">
                  <div className="data-action-info">
                    <div className="setting-title">CSV Export</div>
                    <div className="setting-desc">Current holdings snapshot for spreadsheet analysis</div>
                  </div>
                  <button className="btn-ghost" onClick={onExportCSV}>
                    <Icon name="download" style={{ width:14, height:14 }}/>Export
                  </button>
                </div>
                <SettingDivider/>
                <div className="data-action-row">
                  <div className="data-action-info">
                    <div className="setting-title">Restore Backup</div>
                    <div className="setting-desc">Import a previously exported JSON file (v2, v3 or v4)</div>
                  </div>
                  <button className="btn-ghost" onClick={onImport}>
                    <Icon name="upload" style={{ width:14, height:14 }}/>Import
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-group" style={{ marginTop:20 }}>
              <div className="settings-group-label">Broker Sync</div>
              <div className="settings-card">
                <div className="data-action-row">
                  <div className="data-action-info">
                    <div className="setting-title">Import Trade Republic PDF</div>
                    <div className="setting-desc">Import positions directly from your TR securities or crypto statement PDFs. Extracts holdings quantities automatically.</div>
                  </div>
                  <button className="btn-ghost" onClick={onImportPdf}>
                    <Icon name="upload" style={{ width:14, height:14 }}/>Import PDF
                  </button>
                </div>
                <SettingDivider/>
                <div className="data-action-row">
                  <div className="data-action-info">
                    <div className="setting-title">Import Positions CSV</div>
                    <div className="setting-desc">Merge current values and add unknown assets from a Trade Republic CSV export</div>
                  </div>
                  <button className="btn-ghost" onClick={onImportBrokerCsv}>
                    <Icon name="upload" style={{ width:14, height:14 }}/>Import CSV
                  </button>
                </div>
              </div>
              {brokerImportLog.length > 0 && (
                <div className="broker-log-list">
                  {[...brokerImportLog].slice(-5).reverse().map(item => (
                    <div className="broker-log-row" key={item.id}>
                      <span>{item.source}</span>
                      <span className="mono">{item.importedRows}/{item.totalRows}</span>
                      <span className="mono">{new Date(item.importedAt).toLocaleDateString("en-GB")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <BackfillSection
              history={state.history}
              cy={CURRENCY_SYMBOL}
              onAddMonth={onAddBackfillMonth}
              onRemoveMonth={onRemoveHistoryEntry}
              showToast={showToast}
            />

            <ReviewSection review={state.review} onUpdateReview={onUpdateReview} showToast={showToast}/>

            <div className="data-footer-note">
              <Icon name="info" style={{ width:13, height:13, flexShrink:0, marginTop:1 }}/>
              <span>Live quotes are fetched through your serverless proxy to protect API keys. Portfolio data still stays local by default. <strong>Export regularly</strong> to avoid data loss.</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── BACKFILL PAST MONTHS ─────────────────────────────────────
// History used to start the day the app did. This adds months from before that, taken
// off a broker statement. A backfilled month stores portfolio totals only — reconstructing
// per-asset rows from a statement summary would mean inventing numbers, so it doesn't.
function lastDayOfMonthISO(ym) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return null;
  // Day 0 of the following month is the last day of this one. Noon UTC keeps the date
  // stable regardless of the reader's timezone.
  return new Date(Date.UTC(y, m, 0, 12, 0, 0)).toISOString();
}

function BackfillSection({ history, cy, onAddMonth, onRemoveMonth, showToast }) {
  const [month, setMonth] = useState("");
  const [contributed, setContributed] = useState("");
  const [value, setValue] = useState("");
  const [invested, setInvested] = useState("");
  const [cryptoValue, setCryptoValue] = useState("");
  const [cryptoInvested, setCryptoInvested] = useState("");
  const [investedTouched, setInvestedTouched] = useState(false);

  const backfilled = useMemo(
    () => (history || []).filter(h => h.backfilled).sort((a, b) => a.completedAt.localeCompare(b.completedAt)),
    [history],
  );

  // Everything already invested as of the month before this one, so "invested to date"
  // starts from the right place instead of from zero.
  const priorInvested = useMemo(() => {
    if (!month) return 0;
    const prior = (history || [])
      .filter(h => h.completedAt && h.completedAt.slice(0, 7) < month)
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
      .pop();
    const point = prior ? historyEntryPoint(prior, "all") : null;
    return point ? point.invested : 0;
  }, [history, month]);

  const suggestedInvested = Math.round((priorInvested + (parseFloat(contributed) || 0)) * 100) / 100;
  const investedValue = investedTouched && invested !== "" ? parseFloat(invested) : suggestedInvested;
  const duplicate = month && (history || []).some(h => h.completedAt?.slice(0, 7) === month);
  const valueNum = parseFloat(value);
  const canAdd = !!month && !duplicate && isFinite(valueNum) && valueNum >= 0 && isFinite(investedValue) && investedValue >= 0;

  function reset() {
    setMonth(""); setContributed(""); setValue(""); setInvested("");
    setCryptoValue(""); setCryptoInvested(""); setInvestedTouched(false);
  }

  function submit() {
    const completedAt = lastDayOfMonthISO(month);
    if (!completedAt || !canAdd) return;
    const cv = parseFloat(cryptoValue);
    const ci = parseFloat(cryptoInvested);
    const label = new Date(completedAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    onAddMonth({
      label,
      completedAt,
      backfilled: true,
      contributed: parseFloat(contributed) || 0,
      totals: {
        value: valueNum,
        invested: investedValue,
        ...(isFinite(cv) && cv >= 0 ? { cryptoValue: cv, ...(isFinite(ci) && ci >= 0 ? { cryptoInvested: ci } : {}) } : {}),
      },
    });
    showToast(`${label} added to history.`);
    reset();
  }

  return (
    <div className="settings-group" style={{ marginTop:20 }}>
      <div className="settings-group-label">Backfill past months</div>
      <div className="settings-card">
        <div className="bf-intro">
          Add a month from before you started tracking, straight off a {PLATFORM_NAME} monthly
          statement. Only portfolio totals are stored — per-asset detail isn&apos;t reconstructed,
          because a statement summary can&apos;t supply it honestly.
        </div>

        <div className="bf-grid">
          <label className="bf-field">
            <span>Month</span>
            <input className="editor-inp mono" type="month" value={month} onChange={e => setMonth(e.target.value)}/>
            <em className="bf-help">Statement month</em>
          </label>
          <label className="bf-field">
            <span>Contributed</span>
            <span className="editor-inp-wrap">
              <span className="editor-sym">{cy}</span>
              <input className="editor-inp mono" type="number" inputMode="decimal" min="0" step="1" placeholder="260"
                value={contributed} onChange={e => setContributed(e.target.value)}/>
            </span>
            <em className="bf-help">Paid in that month</em>
          </label>
          <label className="bf-field">
            <span>Value at month end</span>
            <span className="editor-inp-wrap">
              <span className="editor-sym">{cy}</span>
              <input className="editor-inp mono" type="number" inputMode="decimal" min="0" step="0.01" placeholder="1240"
                value={value} onChange={e => setValue(e.target.value)}/>
            </span>
            <em className="bf-help">Closing portfolio value</em>
          </label>
          <label className="bf-field">
            <span>Invested to date</span>
            <span className="editor-inp-wrap">
              <span className="editor-sym">{cy}</span>
              <input className="editor-inp mono" type="number" inputMode="decimal" min="0" step="0.01"
                placeholder={String(suggestedInvested)}
                value={investedTouched ? invested : (month ? String(suggestedInvested) : "")}
                onChange={e => { setInvestedTouched(true); setInvested(e.target.value); }}/>
            </span>
            <em className="bf-help">Running total — edit if wrong</em>
          </label>
          <label className="bf-field">
            <span>Crypto value <i>optional</i></span>
            <span className="editor-inp-wrap">
              <span className="editor-sym">{cy}</span>
              <input className="editor-inp mono" type="number" inputMode="decimal" min="0" step="0.01" placeholder="—"
                value={cryptoValue} onChange={e => setCryptoValue(e.target.value)}/>
            </span>
            <em className="bf-help">Enables the crypto split</em>
          </label>
          <label className="bf-field">
            <span>Crypto invested <i>optional</i></span>
            <span className="editor-inp-wrap">
              <span className="editor-sym">{cy}</span>
              <input className="editor-inp mono" type="number" inputMode="decimal" min="0" step="0.01" placeholder="—"
                value={cryptoInvested} onChange={e => setCryptoInvested(e.target.value)}/>
            </span>
            <em className="bf-help">Defaults to the value above</em>
          </label>
        </div>

        <div className="bf-actions">
          <span className="bf-hint">
            {duplicate
              ? <span style={{ color:"var(--accent-amber)" }}>That month is already in your history.</span>
              : "Leave the crypto boxes empty and the crypto/rest split simply isn't drawn for that month."}
          </span>
          <button className="btn-primary sm" onClick={submit} disabled={!canAdd}>
            <Icon name="check" style={{ width:13, height:13 }}/>Add month
          </button>
        </div>

        <HowTo title="Where to get these numbers, and what gets stored">
          <p>Everything you need is on a {PLATFORM_NAME} monthly account statement. Work forwards from your first
          month, one statement at a time.</p>
          <HowToSteps>
            <li><strong>Month</strong> — the statement&apos;s month. The entry is dated to its last day.</li>
            <li><strong>Contributed</strong> — what you paid in that month.</li>
            <li><strong>Value at month end</strong> — the closing portfolio value on the statement.</li>
            <li><strong>Invested to date</strong> — total paid in since you started. Pre-filled from the running
            total; override it if your first month already had money in it.</li>
            <li><strong>Crypto value</strong> — optional. Supply it and that month appears in the crypto and
            everything-else charts; leave it out and only the whole-portfolio line covers that month.</li>
          </HowToSteps>
          <p>A backfilled month stores those totals and nothing else. Per-asset rows are never reconstructed from a
          summary, so no invented numbers reach the History tab or the drift calculations.</p>
          <HowToTip>Order doesn&apos;t matter. Add months in any sequence — they are sorted by date before anything
          reads them.</HowToTip>
          <HowToTip warn>Don&apos;t estimate a value you can&apos;t find. A month left out simply isn&apos;t plotted;
          a guessed one quietly corrupts every return figure that follows.</HowToTip>
        </HowTo>

        {backfilled.length > 0 && (
          <>
            <SettingDivider/>
            <div className="bf-list">
              {backfilled.map(h => (
                <div key={h.completedAt} className="bf-list-row">
                  <span className="bf-list-m">{h.label}</span>
                  <span className="mono bf-list-v">{cy}{Math.round(h.totals.value).toLocaleString()}</span>
                  <span className="mono bf-list-i">{cy}{Math.round(h.totals.invested).toLocaleString()} in</span>
                  <button className="icon-btn sm" onClick={() => onRemoveMonth(h.completedAt)} aria-label={`Remove ${h.label}`}>
                    <Icon name="trash" style={{ width:13, height:13 }}/>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReviewSection({ review, onUpdateReview, showToast }) {
  const status = reviewStatus(review?.lastReviewedAt, review?.intervalMonths);
  return (
    <div className="settings-group" style={{ marginTop:20 }}>
      <div className="settings-group-label">Portfolio review</div>
      <div className="settings-card">
        <div className="data-action-row">
          <div className="data-action-info">
            <div className="setting-title">Review cadence</div>
            <div className="setting-desc">
              Your plan calls for a periodic review. The app reminds you when one is due — drift
              alerts are continuous and answer a different question.
            </div>
          </div>
          <select
            className="select-inp"
            value={review?.intervalMonths ?? 3}
            onChange={e => onUpdateReview({ intervalMonths: parseInt(e.target.value, 10) })}
            aria-label="Review interval in months"
          >
            <option value={1}>Monthly</option>
            <option value={3}>Quarterly</option>
            <option value={6}>Twice a year</option>
            <option value={12}>Yearly</option>
          </select>
        </div>
        <SettingDivider/>
        <div className="data-action-row" style={{ display:"block" }}>
          <HowTo title="What a review is for, and what to actually do">
            <p>Drift alerts fire continuously and answer &ldquo;is one position out of line right now?&rdquo;. A review
            is the slower question: <strong>is the plan still the right plan?</strong> Both matter; neither replaces
            the other.</p>
            <HowToSteps>
              <li>Open <strong>Analytics</strong> and check the portfolio against its benchmark.</li>
              <li>Check the buckets — has crypto or tech quietly grown past what you meant to hold?</li>
              <li>Confirm your contribution still matches your income rule.</li>
              <li>Check the savings-plan card on the Plan tab for a <strong>re-tune</strong> badge.</li>
              <li>Press <strong>Mark reviewed</strong> to log the date and reset the clock.</li>
            </HowToSteps>
            <HowToTip>Quarterly suits a monthly-contribution plan. Monthly reviews mostly invite tinkering; yearly
            lets a drifting allocation run too long.</HowToTip>
          </HowTo>
        </div>
        <SettingDivider/>
        <div className="data-action-row">
          <div className="data-action-info">
            <div className="setting-title">Last review</div>
            <div className="setting-desc">
              {review?.lastReviewedAt
                ? <>Logged {new Date(review.lastReviewedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}
                    {status.due && <> · next due {status.due.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}</>}</>
                : "Never logged."}
            </div>
          </div>
          <button
            className="btn-ghost"
            onClick={() => { onUpdateReview({ lastReviewedAt: new Date().toISOString() }); showToast("Review logged."); }}
          >
            <Icon name="check" style={{ width:14, height:14 }}/>Mark reviewed
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CASHFLOW SECTION ─────────────────────────────────────────
function CashflowSection({ state, cy, onUpdateIncome, onUpdateCash, onUpdateDcaRule, onUpdateDca, onAddScheduleEntry, onRemoveScheduleEntry, onApplyScheduledDca, showToast }) {
  const [incomeDraft, setIncomeDraft] = useState(String(state.income?.monthlyNet || ""));
  const [incomeLabel, setIncomeLabel] = useState(state.income?.label || "");
  const [cashDraft, setCashDraft] = useState(String(state.cash?.available || ""));
  const [committedDraft, setCommittedDraft] = useState(String(state.cash?.committed || ""));
  const [bufferDraft, setBufferDraft] = useState(String(state.cash?.buffer || ""));
  const [pctDraft, setPctDraft] = useState(String(state.dcaRule?.pctOfIncome ?? 10));
  const [newAmount, setNewAmount] = useState("");
  const [newDate, setNewDate] = useState(addMonths(currentMonthYM(), 1));
  const [newNote, setNewNote] = useState("");

  useEffect(() => { setIncomeDraft(String(state.income?.monthlyNet || "")); }, [state.income?.monthlyNet]);
  useEffect(() => { setIncomeLabel(state.income?.label || ""); }, [state.income?.label]);
  useEffect(() => { setCashDraft(String(state.cash?.available || "")); }, [state.cash?.available]);
  useEffect(() => { setCommittedDraft(String(state.cash?.committed || "")); }, [state.cash?.committed]);
  useEffect(() => { setBufferDraft(String(state.cash?.buffer || "")); }, [state.cash?.buffer]);
  useEffect(() => { setPctDraft(String(state.dcaRule?.pctOfIncome ?? 10)); }, [state.dcaRule?.pctOfIncome]);

  const income = state.income?.monthlyNet || 0;
  const schedule = state.dcaSchedule || [];
  const savingsPct = income > 0 ? (state.dca / income) * 100 : null;
  const suggestions = income > 0
    ? [0.10, 0.15, 0.20, 0.25].map(rate => ({ pct: rate * 100, amount: Math.round(income * rate) }))
    : [];

  // Compute next 12 months of DCA contributions using the schedule
  const next12 = useMemo(() => {
    let totalDca = 0;
    let monthly = [];
    let ym = currentMonthYM();
    for (let i = 0; i < 12; i++) {
      const amt = activeDcaFromSchedule(schedule, state.dca, ym);
      monthly.push({ ym, amount: amt });
      totalDca += amt;
      ym = addMonths(ym, 1);
    }
    return { monthly, totalDca };
  }, [schedule, state.dca]);

  const saveIncome = () => {
    const n = sanitizeNum(incomeDraft, 0, 1_000_000, 0);
    onUpdateIncome({ monthlyNet: n, label: incomeLabel });
    showToast("Income updated");
  };

  const saveCash = () => {
    onUpdateCash({
      available: sanitizeNum(cashDraft, 0, 10_000_000, 0),
      committed: sanitizeNum(committedDraft, 0, 10_000_000, 0),
      buffer: sanitizeNum(bufferDraft, 0, 10_000_000, 0),
    });
    showToast("Cash balance updated");
  };

  const submitNewEntry = () => {
    const amt = sanitizeNum(newAmount, 1, 1_000_000, 0);
    if (!amt) { showToast("Enter a valid DCA amount", "error"); return; }
    if (!/^\d{4}-\d{2}$/.test(newDate)) { showToast("Pick a valid month (YYYY-MM)", "error"); return; }
    onAddScheduleEntry({ amount: amt, effectiveFrom: newDate, note: newNote.trim() });
    setNewAmount("");
    setNewNote("");
    setNewDate(addMonths(newDate, 1));
    showToast("Schedule entry added");
  };

  const todayYM = currentMonthYM();

  return (
    <div key="cashflow" className="modal-body">
      <div className="settings-group">
        <div className="settings-group-label">Monthly Income</div>
        <div className="settings-group-desc">Track your net income to see your DCA as a savings rate. Stored locally on your device.</div>
        <div className="settings-card">
          <SettingRow title="Monthly Net Income" desc="Take-home pay after taxes & deductions. Use a 12-month average.">
            <div className="editor-inp-wrap">
              <span className="editor-sym">{cy}</span>
              <input className="editor-inp mono" type="number" min="0" max="1000000" step="50"
                value={incomeDraft}
                placeholder="0"
                onChange={e => setIncomeDraft(e.target.value)}
                onBlur={saveIncome}
                onKeyDown={e => { if (e.key === "Enter") { saveIncome(); e.target.blur(); } }}
                style={{ width: 100 }} aria-label="Monthly net income"/>
            </div>
          </SettingRow>
          <SettingDivider/>
          <SettingRow title="Label" desc="Optional context (e.g. role / employer)">
            <input className="editor-inp" type="text" value={incomeLabel}
              onChange={e => setIncomeLabel(e.target.value.slice(0, 60))}
              onBlur={saveIncome}
              placeholder="e.g. Team Lead full-time"
              style={{ width: 190, fontSize: 12.5 }} aria-label="Income label"/>
          </SettingRow>
          {income > 0 && (
            <>
              <SettingDivider/>
              <SettingRow title="Savings Rate" desc={`${cy}${state.dca}/mo DCA ÷ ${cy}${income}/mo net income`}>
                {/* A savings rate is not pass/fail. Red said "error" against a deliberate,
                    perfectly ordinary 10% rule; three bands describe it without judging it. */}
                <div className={`target-sum-pill ${savingsPct >= 20 ? "ok" : savingsPct >= 10 ? "mid" : "warn"}`}
                  title={savingsPct >= 20 ? "Strong" : savingsPct >= 10 ? "Typical" : "On the low side"}>
                  <Icon name="trendUp" style={{ width:13, height:13 }}/>
                  {savingsPct.toFixed(1)}%
                </div>
              </SettingRow>
            </>
          )}
        </div>
      </div>

      <div className="settings-group" style={{ marginTop:20 }}>
        <div className="settings-group-label">Contribution Rule</div>
        <div className="settings-group-desc">Tie your monthly DCA to income instead of a fixed number. When your pay changes, the contribution follows.</div>
        <div className="settings-card">
          <SettingRow title="Derive DCA from income" desc="Recalculates whenever your income or this percentage changes. Manual edits still stick until then.">
            <button className={`seg-btn ${state.dcaRule?.enabled ? "active" : ""}`}
              onClick={() => onUpdateDcaRule({ enabled: !state.dcaRule?.enabled, appliedFor: "" })}>
              <Icon name="zap" style={{ width:12, height:12 }}/>{state.dcaRule?.enabled ? "On" : "Off"}
            </button>
          </SettingRow>
          <SettingDivider/>
          <SettingRow title="Share of net income" desc={income > 0 ? `${pctDraft || 0}% of ${cy}${income} = ${cy}${dcaFromIncome(income, pctDraft)}/mo` : "Set your monthly net income above first."}>
            <div className="editor-inp-wrap">
              <input className="editor-inp mono" type="number" min="0" max="100" step="1"
                value={pctDraft}
                onChange={e => setPctDraft(e.target.value)}
                onBlur={() => onUpdateDcaRule({ pctOfIncome: sanitizeNum(pctDraft, 0, 100, 10), appliedFor: "" })}
                onKeyDown={e => { if (e.key === "Enter") { onUpdateDcaRule({ pctOfIncome: sanitizeNum(pctDraft, 0, 100, 10), appliedFor: "" }); e.target.blur(); } }}
                style={{ width: 64 }} aria-label="Percent of net income"/>
              <span className="editor-sym">%</span>
            </div>
          </SettingRow>
        </div>
      </div>

      <div className="settings-group" style={{ marginTop:20 }}>
        <div className="settings-group-label">Cash Balance</div>
        <div className="settings-group-desc">Uninvested cash sitting in your broker account. The Plan tab uses the free portion to build a lump-sum deployment plan.</div>
        <div className="settings-card">
          <SettingRow title="Available" desc="Your broker's uninvested cash balance.">
            <div className="editor-inp-wrap">
              <span className="editor-sym">{cy}</span>
              <input className="editor-inp mono" type="number" min="0" max="10000000" step="10"
                value={cashDraft}
                placeholder="0"
                onChange={e => setCashDraft(e.target.value)}
                onBlur={saveCash}
                onKeyDown={e => { if (e.key === "Enter") { saveCash(); e.target.blur(); } }}
                style={{ width: 100 }} aria-label="Available cash"/>
            </div>
          </SettingRow>
          <SettingDivider/>
          <SettingRow title="Committed" desc="Already earmarked for savings-plan orders that haven't executed yet.">
            <div className="editor-inp-wrap">
              <span className="editor-sym">{cy}</span>
              <input className="editor-inp mono" type="number" min="0" max="10000000" step="10"
                value={committedDraft}
                placeholder="0"
                onChange={e => setCommittedDraft(e.target.value)}
                onBlur={saveCash}
                onKeyDown={e => { if (e.key === "Enter") { saveCash(); e.target.blur(); } }}
                style={{ width: 100 }} aria-label="Committed cash"/>
            </div>
          </SettingRow>
          <SettingDivider/>
          <SettingRow title="Keep as buffer" desc="Cash you never want deployed. Excluded from any buy plan.">
            <div className="editor-inp-wrap">
              <span className="editor-sym">{cy}</span>
              <input className="editor-inp mono" type="number" min="0" max="10000000" step="10"
                value={bufferDraft}
                placeholder="0"
                onChange={e => setBufferDraft(e.target.value)}
                onBlur={saveCash}
                onKeyDown={e => { if (e.key === "Enter") { saveCash(); e.target.blur(); } }}
                style={{ width: 100 }} aria-label="Cash buffer"/>
            </div>
          </SettingRow>
          <SettingDivider/>
          <SettingRow title="Free to deploy" desc="Available − committed − buffer">
            <div className={`target-sum-pill ${freeCash(state.cash) > 0 ? "ok" : "err"}`}>
              <Icon name="wallet" style={{ width:13, height:13 }}/>
              {cy}{freeCash(state.cash).toFixed(2)}
            </div>
          </SettingRow>
        </div>
      </div>

      {income > 0 && (
        <div className="settings-group" style={{ marginTop:20 }}>
          <div className="settings-group-label">DCA Suggestions</div>
          <div className="settings-group-desc">Common savings rates based on your net income.</div>
          <div className="settings-card">
            <div className="dca-preset-grid" role="group" style={{ padding: 12 }}>
              {suggestions.map(sug => (
                <button key={sug.pct} className={`dca-preset-btn mono ${state.dca === sug.amount ? "active" : ""}`}
                  onClick={() => onUpdateDca(String(sug.amount))}>
                  <span style={{ fontWeight: 700 }}>{cy}{sug.amount}</span>
                  <span style={{ fontSize: 10, opacity: 0.7 }}>{sug.pct.toFixed(0)}%</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="settings-group" style={{ marginTop:20 }}>
        <div className="settings-group-label">DCA Schedule</div>
        <div className="settings-group-desc">Plan future DCA changes (e.g. salary increase, lifestyle change). When a date hits, the amount applies automatically.</div>

        <div className="settings-card">
          <div className="schedule-add-grid">
            <div className="editor-inp-wrap sm">
              <span className="editor-sym">{cy}</span>
              <input className="editor-inp mono" type="number" min="1" max="1000000" step="10"
                value={newAmount}
                onChange={e => setNewAmount(e.target.value)}
                placeholder="Amount"
                style={{ width: 90 }} aria-label="New schedule amount"/>
            </div>
            <input className="editor-inp mono" type="month"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              style={{ width: 130 }} aria-label="Effective month"/>
            <input className="asset-text-inp" type="text"
              value={newNote}
              onChange={e => setNewNote(e.target.value.slice(0, 80))}
              placeholder="Note (optional)"
              style={{ flex: 1, minWidth: 100, fontSize: 12 }} aria-label="Schedule note"/>
            <button className="btn-primary sm" onClick={submitNewEntry}>
              <Icon name="plus" style={{ width:13, height:13 }}/>Add
            </button>
          </div>
        </div>

        {schedule.length > 0 ? (
          <div className="schedule-list">
            {schedule.map(item => {
              const isPast = item.effectiveFrom <= todayYM;
              return (
                <div key={item.id} className={`schedule-row ${isPast ? "past" : ""}`}>
                  <div className="schedule-row-main">
                    <span className="schedule-row-date mono">{item.effectiveFrom}</span>
                    <span className="schedule-row-amount mono">{cy}{item.amount}/mo</span>
                    {item.note && <span className="schedule-row-note">{item.note}</span>}
                    {isPast && <span className="schedule-row-tag">applied</span>}
                  </div>
                  <div className="schedule-row-actions">
                    {!isPast && (
                      <button className="btn-ghost xs" onClick={() => onApplyScheduledDca(item.amount, item.id)} title="Apply now">
                        Apply now
                      </button>
                    )}
                    <button className="icon-btn danger-hover" onClick={() => onRemoveScheduleEntry(item.id)} aria-label="Delete schedule entry">
                      <Icon name="close" style={{ width:12, height:12 }}/>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="schedule-empty">
            <Icon name="calendar" style={{ width:18, height:18, opacity:0.6 }}/>
            <span>No scheduled changes yet. Add one above to plan ahead.</span>
          </div>
        )}
      </div>

      <div className="settings-group" style={{ marginTop:20 }}>
        <div className="settings-group-label">12-Month Outlook</div>
        <div className="settings-group-desc">Projected DCA contributions over the next 12 months, based on schedule.</div>
        <div className="settings-card">
          <SettingRow title="Total DCA (next 12 mo)" desc="Sum of monthly contributions">
            <div className="target-sum-pill ok">
              <Icon name="trendUp" style={{ width:13, height:13 }}/>
              {cy}{next12.totalDca.toLocaleString()}
            </div>
          </SettingRow>
          {income > 0 && (
            <>
              <SettingDivider/>
              <SettingRow title="Avg savings rate" desc="DCA total ÷ (12 × monthly net income)">
                <div className={`target-sum-pill ${(next12.totalDca / (income * 12) * 100) >= 15 ? "ok" : "err"}`}>
                  <Icon name="trendUp" style={{ width:13, height:13 }}/>
                  {((next12.totalDca / (income * 12)) * 100).toFixed(1)}%
                </div>
              </SettingRow>
            </>
          )}
        </div>
        <div className="outlook-mini-grid">
          {next12.monthly.map(m => (
            <div key={m.ym} className="outlook-mini-cell">
              <span className="outlook-mini-ym mono">{m.ym}</span>
              <span className="outlook-mini-amt mono">{cy}{m.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ASSET ROW (controlled) ───────────────────────────────────
function AssetRow({ asset, color, currency, isLive, onUpdate, onRemove }) {
  const [v, setV] = useState({ ticker: asset.ticker, name: asset.name, current: String(asset.current), target: String(asset.target), holdings: asset.holdings != null ? String(asset.holdings) : "" });
  // Sync current value when parent updates it (e.g. from live price refresh)
  useEffect(() => { setV(x => ({ ...x, current: String(asset.current) })); }, [asset.current]);
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
        <input className="editor-inp mono" type="number" min="0" max="1000000000" step="any"
          value={v.holdings}
          onChange={e => setV(x => ({ ...x, holdings: e.target.value }))}
          onBlur={() => flush("holdings")}
          placeholder="qty"
          title="Number of units/shares/coins you own. When set, current value auto-updates from live prices."
          style={{ width:68 }} aria-label="Holdings quantity"/>
      </div>
      <div className="editor-inp-wrap sm">
        {isLive && <span className="live-badge-dot" title="Auto-updated from live price \u00d7 holdings" aria-hidden="true"/>}
        <span className="editor-sym">{currency}</span>
        <input className="editor-inp mono" type="number" min="0" max="10000000" step="0.01"
          value={v.current}
          onChange={e => setV(x => ({ ...x, current: e.target.value }))}
          onBlur={() => flush("current")}
          title={isLive ? "Auto-updated from holdings \u00d7 live price \u2014 edit to override" : "Manual value"}
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
  const modalRef = useRef(null);
  useEffect(() => { modalRef.current?.focus(); }, []);
  useFocusTrap(modalRef);
  return (
    <div className="overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="modal sm-modal" ref={modalRef} tabIndex={-1} onClick={e => e.stopPropagation()}>
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

function DcaPickerModal({ cy, currentValue, income, onClose, onSave }) {
  const [draft, setDraft] = useState(String(currentValue));
  const defaultPresets = [10, 20, 50, 100, 130, 150, 200, 300];
  const incomeNet = income?.monthlyNet || 0;
  const presetValues = incomeNet > 0
    ? [0.05, 0.10, 0.15, 0.20, 0.25, 0.30].map(r => Math.round(incomeNet * r))
    : defaultPresets;
  const modalRef = useRef(null);
  useFocusTrap(modalRef);

  useEffect(() => { setDraft(String(currentValue)); }, [currentValue]);

  const parsedDraft = sanitizeNum(draft, 1, 1_000_000, currentValue);
  const draftPct = incomeNet > 0 ? (parsedDraft / incomeNet) * 100 : null;

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="DCA amount editor">
      <div className="modal sm-modal dca-modal" ref={modalRef} onClick={e => e.stopPropagation()}>
        <div className="modal-icon-wrap" style={{ background:"rgba(99,102,241,.12)" }}>
          <Icon name="zap" style={{ width:24, height:24, color:"var(--accent-indigo)" }}/>
        </div>
        <h3>Set Monthly DCA</h3>
        <p>{incomeNet > 0 ? `Pick a savings rate or enter a custom amount. Net income: ${cy}${incomeNet}/mo.` : "Select a preset or enter a custom monthly amount."}</p>

        <div className="dca-preset-grid" role="group" aria-label="DCA presets">
          {presetValues.map((v, i) => {
            const pct = incomeNet > 0 ? [5, 10, 15, 20, 25, 30][i] : null;
            return (
              <button
                key={v + "-" + i}
                className={`dca-preset-btn mono ${parsedDraft === v ? "active" : ""}`}
                onClick={() => setDraft(String(v))}
              >
                <span>{cy}{v}</span>
                {pct != null && <span style={{ display:"block", fontSize:10, opacity:0.7, marginTop:2 }}>{pct}%</span>}
              </button>
            );
          })}
        </div>

        <div className="editor-inp-wrap dca-modal-input-wrap">
          <span className="editor-sym">{cy}</span>
          <input
            className="editor-inp mono"
            type="number"
            min="1"
            max="1000000"
            step="10"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onSave(draft); }}
            aria-label="Monthly DCA amount"
            autoFocus
          />
          <span className="editor-sym">/mo</span>
        </div>

        {draftPct != null && (
          <div className="dca-pct-hint" style={{ textAlign:"center", fontSize:12, color:"var(--text3)", marginTop:8 }}>
            {draftPct.toFixed(1)}% of your monthly net income
          </div>
        )}

        <div className="modal-btns">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(draft)}>Save DCA</button>
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

// ─── PROGRESS RING ────────────────────────────────────────────
function ProgressRing({ pct, color, size = 26 }) {
  const r = (size - 5) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth="2.2" opacity="0.1"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="2.2"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition:"stroke-dashoffset .9s cubic-bezier(.16,1,.3,1)" }}/>
    </svg>
  );
}

// ─── MINI SPARKLINE ───────────────────────────────────────────
function MiniSparkline({ values, color }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rng = (max - min) || 1;
  const W = 72, H = 22;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (W - 4) + 2;
    const y = H - 3 - ((v - min) / rng) * (H - 7);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1].split(",");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ display:"block", marginTop:8 }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
        points={pts.join(" ")} opacity="0.5"/>
      <circle cx={last[0]} cy={last[1]} r="2.2" fill={color} opacity="0.85"/>
    </svg>
  );
}

// ─── DRIFT CELL ───────────────────────────────────────────────
function DriftCell({ drift }) {
  const neg = drift < 0;
  const c = neg ? "var(--accent-blue)" : "var(--accent-amber)";
  const barW = Math.min(Math.abs(drift) / 5 * 100, 100);
  return (
    <div className="drift-cell">
      <div className="drift-cell-track">
        <div className="drift-cell-fill" style={{
          width:`${barW}%`, background:c,
          marginLeft: neg ? "auto" : undefined,
          animationDelay:"inherit",
        }}/>
      </div>
      <span className="drift-cell-val mono" style={{ color:c }}>
        {drift >= 0 ? "+" : ""}{drift.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── COMMAND PALETTE ──────────────────────────────────────────
function CommandPalette({ tabs, onClose, onTabSelect, onToggleTheme, onOpenSettings, assets }) {
  const [query, setQuery] = useState("");
  const [sel, setSel]     = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const actions = useMemo(() => [
    ...tabs.map((t, i) => ({ id:`tab-${i}`, label:t.label, type:"tab", icon:t.icon, fn:() => { onTabSelect(i); onClose(); } })),
    { id:"settings", label:"Open Settings", type:"action", icon:"settings", fn:() => { onOpenSettings(); onClose(); } },
    { id:"theme",    label:"Toggle Theme",  type:"action", icon:"auto",     fn:() => { onToggleTheme(); onClose(); } },
    ...assets.map(a => ({ id:`a-${a.ticker}`, label:`${a.ticker}  ${a.name}`, type:"asset", icon:a.icon, fn:() => { onTabSelect(0); onClose(); } })),
  ], [tabs, assets, onTabSelect, onClose, onToggleTheme, onOpenSettings]);

  const results = useMemo(() =>
    query ? actions.filter(a => a.label.toLowerCase().includes(query.toLowerCase())) : actions,
  [query, actions]);

  useEffect(() => { setSel(0); }, [query]);

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[sel]) results[sel].fn();
    if (e.key === "Escape") onClose();
  };

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={e => e.stopPropagation()}>
        <div className="cmd-input-row">
          <Icon name="settings" style={{ width:16, height:16, color:"var(--text3)", flexShrink:0 }}/>
          <input ref={inputRef} className="cmd-input" value={query}
            placeholder="Search tabs, assets, actions…"
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKey} aria-label="Command palette"/>
          <kbd className="cmd-kbd">ESC</kbd>
        </div>
        <div className="cmd-list" role="listbox">
          {results.length === 0
            ? <div className="cmd-empty">No results for "{query}"</div>
            : results.map((a, i) => (
              <button key={a.id} role="option" aria-selected={i === sel}
                className={`cmd-item${i === sel ? " sel" : ""}`}
                onMouseEnter={() => setSel(i)} onClick={a.fn}>
                <span className="cmd-ico"><Icon name={a.icon} style={{ width:13, height:13 }}/></span>
                <span className="cmd-lbl">{a.label}</span>
                <span className="cmd-tag">{a.type}</span>
              </button>
            ))
          }
        </div>
        <div className="cmd-foot">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>⌘K</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

