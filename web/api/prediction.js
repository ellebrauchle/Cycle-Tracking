// Serves the stored prediction to the companion view. Session required --
// this is the one endpoint that hands personal data back over the internet.

import { requireSession } from "../lib/auth.js";
import { readJSON, PATHS } from "../lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  if (!requireSession(req, res)) return;

  const prediction = await readJSON(PATHS.prediction);
  if (!prediction) return res.status(200).json({ prediction: null });

  // generated_at tells the UI how stale this is. Ingest is manual (D10), so
  // the view must be able to say "this is three weeks old" rather than imply
  // it is current.
  const generated = prediction.generated_at || prediction.received_at?.slice(0, 10);
  const ageDays = generated
    ? Math.floor((Date.now() - new Date(generated + "T00:00:00Z")) / 86400_000)
    : null;

  return res.status(200).json({ prediction, age_days: ageDays });
}
