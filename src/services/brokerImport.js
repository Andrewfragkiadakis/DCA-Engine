function parseCsv(text) {
  const rows = [];
  let i = 0;
  let cur = "";
  let row = [];
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i += 1;
      continue;
    }
    if (!inQuotes && ch === ",") {
      row.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cur);
      cur = "";
      if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }
  if (cur.length || row.length) {
    row.push(cur);
    if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
  }

  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map(h => String(h).trim());
  const records = rows.slice(1).map(cols => {
    const rec = {};
    headers.forEach((h, idx) => { rec[h] = String(cols[idx] || "").trim(); });
    return rec;
  });

  return { headers, records };
}

function normalizeTicker(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9.&]/g, "").slice(0, 12);
}

function asNum(raw, fallback = 0) {
  const normalized = String(raw || "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function mapCategory(name = "") {
  const v = String(name).toLowerCase();
  if (v.includes("crypto")) return "Crypto";
  if (v.includes("dividend")) return "Dividend";
  if (v.includes("bond")) return "Bond";
  if (v.includes("commodity")) return "Commodity";
  if (v.includes("etf") || v.includes("fund")) return "ETF";
  if (v.includes("tech")) return "Tech";
  return "Other";
}

function parseTradeRepublic(records) {
  return records.map(r => {
    const ticker = normalizeTicker(r.Ticker || r.Symbol || r.ISIN || r.WKN);
    const holdings = asNum(r.Quantity || r.Holdings || r.Shares || r.Units || r.Amount || 0);
    return {
      ticker,
      name: r.Name || r.Asset || ticker || "Imported Asset",
      current: asNum(r["Current Value"] || r["Market Value"] || r.Value || 0),
      target: asNum(r["Target %"] || r.Target || 0),
      cat: mapCategory(r.Category || r["Asset Class"]),
      ...(holdings > 0 ? { holdings } : {}),
    };
  }).filter(a => a.ticker);
}

export function importBrokerCsv(csvText) {
  const { headers, records } = parseCsv(csvText);
  const assets = parseTradeRepublic(records);

  const deduped = [];
  const seen = new Set();
  for (const asset of assets) {
    if (seen.has(asset.ticker)) continue;
    seen.add(asset.ticker);
    deduped.push(asset);
  }

  return {
    headers,
    totalRows: records.length,
    importedRows: deduped.length,
    assets: deduped,
  };
}

// ─── ISIN → Ticker mapping for common Trade Republic assets ───
const ISIN_TO_TICKER = {
  // Major ETFs
  IE00BK5BQT80: "VWCE",   // Vanguard FTSE All-World
  IE00B3RBWM25: "VWRL",   // Vanguard FTSE All-World (Dist)
  IE00BK5BQY34: "VHYL",   // Vanguard FTSE All-World High Dividend
  IE00B4L5Y983: "IWDA",   // iShares Core MSCI World
  IE00B3XXRP09: "VUSA",   // Vanguard S&P 500
  IE00BFM17J73: "VWCE",   // alt share class
  US78462F1030: "SPY",    // SPDR S&P 500
  IE00B5BMR087: "CSPX",   // iShares Core S&P 500
  IE0031442068: "IUSA",   // iShares S&P 500
  LU0392494562: "DBXD",   // Xtrackers MSCI World
  DE0005933931: "EXS1",   // iShares Core DAX
  IE00BZ163K21: "VUAA",   // Vanguard S&P 500 (Acc)
  // Major US stocks
  US0378331005: "AAPL",
  US5949181045: "MSFT",
  US67066G1040: "NVDA",
  US0231351067: "AMZN",
  US02079K3059: "GOOG",
  US30303M1027: "META",
  US88160R1014: "TSLA",
  US4781601046: "JNJ",
  US1912161007: "KO",
  US7427181091: "PG",
  US9311421039: "WMT",
  US92826C8394: "V",
  US0846707026: "BRK.B",
  // European stocks
  NL0010273215: "ASML",
  DE0007164600: "SAP",
  DE0007236101: "SIE",
  FR0000121014: "MC",     // LVMH
  DE0008430026: "MUV2",   // Munich Re
  DE0007100000: "MBG",    // Mercedes-Benz
  NL0000235190: "AIR",    // Airbus
};

// Common crypto identifiers from Trade Republic
const CRYPTO_TICKER_MAP = {
  bitcoin: "BTC",
  btc: "BTC",
  ethereum: "ETH",
  eth: "ETH",
  solana: "SOL",
  sol: "SOL",
  cardano: "ADA",
  ada: "ADA",
  polkadot: "DOT",
  dot: "DOT",
  avalanche: "AVAX",
  avax: "AVAX",
  polygon: "MATIC",
  matic: "MATIC",
  chainlink: "LINK",
  link: "LINK",
  litecoin: "LTC",
  ltc: "LTC",
  uniswap: "UNI",
  uni: "UNI",
  ripple: "XRP",
  xrp: "XRP",
  dogecoin: "DOGE",
  doge: "DOGE",
  "shiba inu": "SHIB",
  shib: "SHIB",
  stellar: "XLM",
  xlm: "XLM",
  cosmos: "ATOM",
  atom: "ATOM",
  algorand: "ALGO",
  algo: "ALGO",
  tezos: "XTZ",
  xtz: "XTZ",
  "the sandbox": "SAND",
  aave: "AAVE",
  maker: "MKR",
  compound: "COMP",
  decentraland: "MANA",
  eos: "EOS",
  tron: "TRX",
  trx: "TRX",
  near: "NEAR",
  "near protocol": "NEAR",
  aptos: "APT",
  apt: "APT",
  arbitrum: "ARB",
  arb: "ARB",
  optimism: "OP",
  op: "OP",
  sei: "SEI",
  sui: "SUI",
  pepe: "PEPE",
  bonk: "BONK",
  render: "RNDR",
  rndr: "RNDR",
  injective: "INJ",
  inj: "INJ",
  fetch: "FET",
  "fetch.ai": "FET",
};

function guessCategoryFromName(name) {
  const low = name.toLowerCase();
  if (CRYPTO_TICKER_MAP[low]) return "Crypto";
  if (low.includes("etf") || low.includes("ucits") || low.includes("acc)") || low.includes("dist)") || low.includes("vanguard") || low.includes("ishares") || low.includes("xtrackers") || low.includes("amundi") || low.includes("lyxor") || low.includes("spdr")) return "ETF";
  if (low.includes("bond") || low.includes("anleihe") || low.includes("treasury")) return "Bond";
  if (low.includes("gold") || low.includes("silver") || low.includes("commodity") || low.includes("rohstoff")) return "Commodity";
  return "Other";
}

export function parseDeNum(raw) {
  // German number format: 1.234,56 → 1234.56
  const s = String(raw || "").replace(/\s/g, "").replace(/€/g, "").replace(/EUR/gi, "").trim();
  const normalized = s.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function extractIsin(text) {
  const match = text.match(/[A-Z]{2}[A-Z0-9]{9}[0-9]/);
  return match ? match[0] : null;
}

/**
 * Parse Trade Republic securities PDF ("Depotauszug" / "Depotübersicht")
 * Extracts: ISIN, name, quantity (Stück), market value (EUR)
 */
export function parseTrSecuritiesPdf(lines) {
  const assets = [];

  // Strategy: look for ISIN patterns and extract surrounding context
  // TR securities statements list each position with:
  //   - Asset name
  //   - ISIN
  //   - Stück/Anteile (quantity)
  //   - Kurs (price)
  //   - Wert/Kurswert (market value)

  // Collect all lines into a single block for pattern matching
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isin = extractIsin(line);
    if (!isin) continue;

    // Look backwards for asset name (usually 1-3 lines before ISIN)
    let name = "";
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      const prev = lines[j].trim();
      // Skip empty lines or lines that are just numbers/dates
      if (!prev || /^\d[\d.,\s]*$/.test(prev) || /^\d{2}[./]\d{2}[./]\d{2,4}$/.test(prev)) continue;
      // Skip lines that are clearly headers or unrelated
      if (/^(Depotauszug|Depot|Stück|Anteile|Kurs|Wert|Kurswert|Saldo|Summe|Seite|Datum)/i.test(prev)) continue;
      // Skip lines that contain ISIN (another asset)
      if (extractIsin(prev)) continue;
      name = prev;
      break;
    }

    // Look forward and around for quantity and value
    let quantity = 0;
    let value = 0;
    const searchWindow = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 6)).join(" ");

    // Match "Stück" or "Anteile" patterns: "1,234 Stück" or "Stück 1,234" or "Anteile: 0,5432"
    // The (?<![A-Za-z0-9]) guard stops this from grabbing trailing digits off an
    // adjacent ISIN (e.g. "...BQT80 Stück" must not read "80" as the quantity).
    const qtyPatterns = [
      /(?<![A-Za-z0-9])(\d[\d.,]*)\s*(?:Stück|Anteile|St\.|Stk)/i,
      /(?:Stück|Anteile|St\.|Stk)[:\s]*(\d[\d.,]*)/i,
      /(?:Bestand|Menge)[:\s]*(\d[\d.,]*)/i,
    ];
    for (const pat of qtyPatterns) {
      const m = searchWindow.match(pat);
      if (m) { quantity = parseDeNum(m[1]); break; }
    }

    // Match value patterns: "EUR 1.234,56" or "1.234,56 EUR" or "Kurswert 1.234,56"
    const valPatterns = [
      /(?:Kurswert|Wert|Marktwert|Gesamtwert)[:\s]*(?:EUR\s*)?(-?[\d.,]+)/i,
      /(?:EUR|€)\s*(-?[\d.,]+)/i,
      /(-?[\d.]+,\d{2})\s*(?:EUR|€)/i,
    ];
    // Search in lines after ISIN for value
    const valueWindow = lines.slice(i, Math.min(lines.length, i + 5)).join(" ");
    for (const pat of valPatterns) {
      const m = valueWindow.match(pat);
      if (m) { value = parseDeNum(m[1]); break; }
    }
    // If no value found, also try the broader window
    if (value === 0) {
      for (const pat of valPatterns) {
        const m = searchWindow.match(pat);
        if (m) { value = parseDeNum(m[1]); break; }
      }
    }

    const ticker = ISIN_TO_TICKER[isin] || isin;
    if (!name) name = ticker;

    assets.push({
      ticker,
      name: name.slice(0, 40),
      current: Math.abs(value),
      target: 0,
      cat: guessCategoryFromName(name),
      ...(quantity > 0 ? { holdings: quantity } : {}),
      _isin: isin,
    });
  }

  return assets;
}

/**
 * Parse Trade Republic crypto PDF ("Kryptoauszug" / crypto statement)
 * Extracts: coin name, quantity, value (EUR)
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseTrCryptoPdf(lines) {
  const assets = [];

  // Strategy: crypto statements list each coin with name, quantity, and value
  // Look for known crypto names or patterns like "Bitcoin", "Ethereum", etc.
  // followed by quantity and EUR value

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();

    // Check if this line contains a known crypto name
    let matchedTicker = null;
    let matchedName = null;

    for (const [key, ticker] of Object.entries(CRYPTO_TICKER_MAP)) {
      // Whole-word match only — substring "includes" false-matched things like
      // "Seite 1 von 2" (page footer) against the "sei" coin key.
      const wordBoundaryMatch = new RegExp(`\\b${escapeRegex(key)}\\b`).test(line);
      if (wordBoundaryMatch && line.length < 60) {
        matchedTicker = ticker;
        matchedName = key.charAt(0).toUpperCase() + key.slice(1);
        break;
      }
    }

    if (!matchedTicker) continue;

    // Deduplicate - skip if we already have this ticker
    if (assets.some(a => a.ticker === matchedTicker)) continue;

    // Search surrounding lines for quantity and value
    const searchWindow = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 8));
    const windowText = searchWindow.join(" ");

    let quantity = 0;
    let value = 0;

    // Quantity patterns for crypto: "0,00234567" (typically a decimal number)
    // Value patterns: "EUR 1.234,56" or "1.234,56 €"
    const valPatterns = [
      /(?:EUR|€)\s*(-?[\d.,]+)/i,
      /(-?[\d.]+,\d{2})\s*(?:EUR|€)/i,
      /(?:Wert|Kurswert|Marktwert|Gesamtwert)[:\s]*(?:EUR\s*)?(-?[\d.,]+)/i,
    ];

    for (const pat of valPatterns) {
      const m = windowText.match(pat);
      if (m) { value = parseDeNum(m[1]); break; }
    }

    // For quantity, look for numbers that look like crypto amounts
    // (could be very small like 0,00123 or large like 1234,5678)
    const qtyPatterns = [
      /(?:Anzahl|Menge|Bestand|Stück)[:\s]*(\d[\d.,]*)/i,
      /(\d+,\d{4,})/,  // numbers with 4+ decimals are likely crypto quantities
    ];
    for (const pat of qtyPatterns) {
      const m = windowText.match(pat);
      if (m) {
        const parsed = parseDeNum(m[1]);
        // Sanity check: quantity shouldn't equal the EUR value
        if (parsed > 0 && Math.abs(parsed - value) > 0.01) {
          quantity = parsed;
          break;
        }
      }
    }

    assets.push({
      ticker: matchedTicker,
      name: matchedName,
      current: Math.abs(value),
      target: 0,
      cat: "Crypto",
      ...(quantity > 0 ? { holdings: quantity } : {}),
    });
  }

  return assets;
}

/**
 * Parse a Trade Republic PDF statement (securities or crypto).
 * Uses pdfjs-dist to extract text, then parses the structured content.
 * @param {ArrayBuffer} pdfBuffer - The raw PDF file as ArrayBuffer
 * @returns {Promise<{assets: Array, type: string, totalRows: number, importedRows: number}>}
 */
export async function importTradeRepublicPdf(pdfBuffer) {
  const pdfjsLib = await import("pdfjs-dist/build/pdf.min.mjs");

  // Use the bundled worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const doc = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
  const allLines = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    // Group text items by Y position to reconstruct lines
    const items = content.items.filter(it => it.str.trim());
    if (!items.length) continue;

    // Sort by Y (descending = top to bottom), then X (left to right)
    items.sort((a, b) => {
      const dy = b.transform[5] - a.transform[5];
      if (Math.abs(dy) > 3) return dy;
      return a.transform[4] - b.transform[4];
    });

    let currentY = items[0].transform[5];
    let currentLine = "";
    for (const item of items) {
      const y = item.transform[5];
      if (Math.abs(y - currentY) > 3) {
        if (currentLine.trim()) allLines.push(currentLine.trim());
        currentLine = item.str;
        currentY = y;
      } else {
        currentLine += (currentLine ? " " : "") + item.str;
      }
    }
    if (currentLine.trim()) allLines.push(currentLine.trim());
  }

  if (!allLines.length) {
    return { assets: [], type: "unknown", totalRows: 0, importedRows: 0 };
  }

  // Detect document type
  const joined = allLines.join(" ").toLowerCase();
  const isCrypto = joined.includes("krypto") || joined.includes("crypto")
    || (joined.includes("bitcoin") && !joined.includes("isin"));
  const isSecurities = joined.includes("depotauszug") || joined.includes("depotübersicht")
    || joined.includes("wertpapier") || joined.includes("isin");

  let assets = [];
  let type = "unknown";

  if (isCrypto) {
    type = "crypto";
    assets = parseTrCryptoPdf(allLines);
  }
  if (isSecurities || assets.length === 0) {
    const secAssets = parseTrSecuritiesPdf(allLines);
    if (secAssets.length > 0) {
      type = assets.length > 0 ? "mixed" : "securities";
      assets = [...assets, ...secAssets];
    }
  }

  // If neither parser found anything, try a general number extraction as fallback
  if (assets.length === 0) {
    type = "unrecognized";
  }

  // Deduplicate by ticker
  const deduped = [];
  const seen = new Set();
  for (const asset of assets) {
    if (seen.has(asset.ticker)) continue;
    seen.add(asset.ticker);
    deduped.push(asset);
  }

  return {
    assets: deduped,
    type,
    totalRows: allLines.length,
    importedRows: deduped.length,
    rawLines: allLines,
  };
}
