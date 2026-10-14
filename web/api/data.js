// Receives the prediction computed locally by ingest.py.
//
// Only the CONCLUSION is uploaded -- predicted dates, cycle length, confidence.
// The full health history (every logged day, every symptom) stays on the laptop
// and never reaches this server. That is deliberate: the server only needs to
// know when to notify, not what the data says (D8).

import { writeJSON, PATHS } from "../lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // Shared secret -- without it, anyone who found this URL could overwrite the
  // prediction and trigger notifications.
  const provided = req.headers["x-upload-secret"];
  if (!process.env.UPLOAD_SECRET || provided !== process.env.UPLOAD_SECRET) {
    return res.status(401).json({ error: "bad or missing upload secret" });
  }

  const payload = req.body;
  const required = ["last_period_start", "window_start", "window_end"];
  const missing = required.filter((k) => !payload?.[k]);
  if (missing.length) {
    return res.status(400).json({ error: "missing fields: " + missing.join(", ") });
  }

  try {
    await writeJSON(PATHS.prediction, {
      ...payload,
      received_at: new Date().toISOString(),
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
