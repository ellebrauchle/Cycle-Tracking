// Records thumbs up/down taps from a notification (PRD Q6).
//
// Now that there is somewhere to put it, feedback is appended to a log rather
// than discarded. Nothing reads it yet -- the point is to start accumulating
// signal, since tuning which notifications are useful needs history, the same
// way trend detection does.

import { readJSON, writeJSON, PATHS } from "../lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { action, tag, at } = req.body || {};
  if (action !== "useful" && action !== "not-useful") {
    return res.status(400).json({ error: "action must be 'useful' or 'not-useful'" });
  }

  try {
    const log = await readJSON(PATHS.feedback, []);
    log.push({ action, tag: tag || null, at: at || new Date().toISOString() });
    await writeJSON(PATHS.feedback, log.slice(-500)); // keep it bounded
    return res.status(200).json({ ok: true, recorded: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
