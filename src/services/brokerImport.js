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
    return {
      ticker,
      name: r.Name || r.Asset || ticker || "Imported Asset",
      current: asNum(r["Current Value"] || r["Market Value"] || r.Value || 0),
      target: asNum(r["Target %"] || r.Target || 0),
      cat: mapCategory(r.Category || r["Asset Class"]),
    };
  }).filter(a => a.ticker);
}

function parseIbkr(records) {
  return records.map(r => {
    const ticker = normalizeTicker(r.Symbol || r.Ticker || r.Conid || "");
    return {
      ticker,
      name: r.Description || r.Name || ticker || "Imported Asset",
      current: asNum(r["Market Value"] || r["Position Value"] || r.Value || 0),
      target: asNum(r["Target %"] || 0),
      cat: mapCategory(r["Asset Class"] || r.Sector || ""),
    };
  }).filter(a => a.ticker);
}

function parseGeneric(records) {
  return records.map(r => {
    const ticker = normalizeTicker(r.Ticker || r.Symbol || r.Asset || "");
    return {
      ticker,
      name: r.Name || ticker || "Imported Asset",
      current: asNum(r.Current || r["Current Value"] || r.Value || 0),
      target: asNum(r.Target || r["Target %"] || 0),
      cat: mapCategory(r.Category || r["Asset Class"] || ""),
    };
  }).filter(a => a.ticker);
}

export function importBrokerCsv(csvText, broker) {
  const { headers, records } = parseCsv(csvText);
  const source = String(broker || "generic").toLowerCase();

  let assets = [];
  if (source === "trade-republic") assets = parseTradeRepublic(records);
  else if (source === "interactive-brokers" || source === "ibkr") assets = parseIbkr(records);
  else assets = parseGeneric(records);

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

export async function fetchBrokerPositionsAdapter(adapter, credentials = {}) {
  const kind = String(adapter || "").toLowerCase();
  if (!["trade-republic", "interactive-brokers"].includes(kind)) {
    return { ok: false, error: "Unsupported adapter" };
  }

  if (!credentials.apiKey && !credentials.accessToken) {
    return {
      ok: false,
      error: "Missing credentials",
      hint: "For security, connect broker APIs via your own backend and pass only scoped tokens.",
    };
  }

  return {
    ok: false,
    error: "Adapter scaffold ready",
    hint: "Implement broker-specific OAuth/token exchange endpoint in /api/brokers/* and map to normalized positions.",
  };
}
