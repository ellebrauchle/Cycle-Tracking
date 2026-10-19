// Sends a one-off notification with an arbitrary title/body/tag.
//
// Purpose: tone calibration. The rules engine currently speaks in one voice,
// chosen by me rather than tested. This endpoint sends variants so they can be
// rated in the app, and the feedback log answers which voice to keep.
//
// Authenticated with the upload secret (same as /api/data), so a sampler can
// be triggered from a laptop without the companion-view password.
//
// This is a calibration tool, not part of the daily path. The cron never calls
// it, and it does not touch the sent-log.

import webpush from "web-push";
import { readJSON, writeJSON, PATHS } from "../lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  if (!process.env.UPLOAD_SECRET || req.headers["x-upload-secret"] !== process.env.UPLOAD_SECRET) {
    return res.status(401).json({ error: "bad or missing upload secret" });
  }

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: "VAPID keys not configured" });
  }
  webpush.setVapidDetails(
    VAPID_SUBJECT || "mailto:petalping@example.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  const { title, body, tag } = req.body || {};
  if (!body || !tag) return res.status(400).json({ error: "body and tag are required" });

  const stored = await readJSON(PATHS.subscription);
  if (!stored?.subscription) return res.status(409).json({ error: "no push subscription saved" });

  // Carry the text in the deep link so the app can show exactly what was sent
  // and rate THAT, rather than whatever today's rule happens to be.
  const url =
    `/?note=${encodeURIComponent(tag)}` +
    `&t=${encodeURIComponent(title || "Petal Ping")}` +
    `&b=${encodeURIComponent(body)}`;

  try {
    await webpush.sendNotification(
      stored.subscription,
      JSON.stringify({ title: title || "Petal Ping", body, tag, url })
    );
    return res.status(200).json({ sent: true, tag });
  } catch (err) {
    const gone = err.statusCode === 404 || err.statusCode === 410;
    if (gone) {
      await writeJSON(PATHS.subscription, { subscription: null, expired_at: new Date().toISOString() });
    }
    return res.status(502).json({ sent: false, error: err.body || err.message, subscriptionExpired: gone });
  }
}
