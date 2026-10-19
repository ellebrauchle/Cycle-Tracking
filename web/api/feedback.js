// Records thumbs up/down taps, and the optional note explaining why.
//
// The note is the useful part. A thumb says a notification was wrong; only the
// note says HOW -- "too long", "too chipper", "woke me at 7am" and "don't care
// about sleep tips" are four different fixes that look identical as a thumb.
//
// Nothing reads this automatically, and that is deliberate (D4 -- no ML in the
// loop, because generated health claims are the risk this project avoids). The
// loop is: notes accumulate here, a human reads them, rules.js gets edited, and
// the change lands in git where it can be reviewed and reverted.

import { requireSession } from "../lib/auth.js";
import { readJSON, writeJSON, PATHS } from "../lib/store.js";

const MAX_NOTE = 500;

export default async function handler(req, res) {
  // Session required. This log is meant to answer "which notifications are
  // worth sending" (Q5); tuning rules against rows anyone could write would
  // be worse than having no data.
  if (!requireSession(req, res)) return;

  // Reading the log back: how the rules actually get updated.
  if (req.method === "GET") {
    const log = await readJSON(PATHS.feedback, []);
    return res.status(200).json({ count: log.length, feedback: log });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "GET or POST only" });

  const { action, tag, at, note, attachToLast } = req.body || {};

  // Attaching a note to the vote that was just cast, so a slow typist never
  // loses the vote itself if they wander off mid-sentence.
  if (attachToLast) {
    if (typeof note !== "string" || !note.trim()) {
      return res.status(400).json({ error: "note is required when attaching" });
    }
    const log = await readJSON(PATHS.feedback, []);
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].tag === (tag || null)) {
        log[i].note = note.trim().slice(0, MAX_NOTE);
        await writeJSON(PATHS.feedback, log);
        return res.status(200).json({ ok: true, attached: true });
      }
    }
    return res.status(404).json({ error: "no matching vote to attach to" });
  }

  if (action !== "useful" && action !== "not-useful") {
    return res.status(400).json({ error: "action must be 'useful' or 'not-useful'" });
  }

  try {
    const log = await readJSON(PATHS.feedback, []);
    log.push({
      action,
      tag: tag || null,
      at: at || new Date().toISOString(),
      note: typeof note === "string" && note.trim() ? note.trim().slice(0, MAX_NOTE) : null,
    });
    await writeJSON(PATHS.feedback, log.slice(-500)); // keep it bounded
    return res.status(200).json({ ok: true, recorded: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
