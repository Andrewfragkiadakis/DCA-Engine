function json(res, code, payload) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sanitizeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function supabaseInsert(row) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { ok: true, persisted: false, reason: "supabase-not-configured" };
  }

  const target = `${url.replace(/\/$/, "")}/rest/v1/price_snapshots`;
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase insert failed (${response.status}): ${text.slice(0, 180)}`);
  }

  return { ok: true, persisted: true };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  try {
    const body = req.body || {};
    const projectId = String(body.projectId || "dca-engine").slice(0, 64);
    const snapshot = body.snapshot && typeof body.snapshot === "object" ? body.snapshot : null;
    if (!snapshot) return json(res, 400, { ok: false, error: "snapshot object is required" });

    const row = {
      project_id: projectId,
      captured_at: new Date(snapshot.capturedAt || Date.now()).toISOString(),
      currency: String(snapshot.currency || "USD").toUpperCase().slice(0, 4),
      total_value: sanitizeNum(snapshot.totalValue, 0),
      daily_pnl: sanitizeNum(snapshot.dailyPnl, 0),
      daily_pnl_pct: sanitizeNum(snapshot.dailyPnlPct, 0),
      payload: snapshot,
    };

    const out = await supabaseInsert(row);
    return json(res, 200, { ok: true, ...out });
  } catch (error) {
    return json(res, 500, { ok: false, error: error?.message || "Snapshot proxy error" });
  }
};
