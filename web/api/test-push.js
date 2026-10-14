// Sends today's notification on demand, so push can be tested without waiting
// for the daily cron.
//
// Deliberately NOT a separate code path: it asks the same rules engine the
// cron asks, so what arrives here is exactly what would arrive at 11:00. A
// test that exercises different code proves nothing about the real thing.
//
// It does not touch the sent-log -- a test should not cause the cron to skip
// a real notification later today.

import webpush from "web-push";
import { requireSession } from "../lib/auth.js";
import { readJSON, writeJSON, PATHS } from "../lib/store.js";
import { selectNotification } from "../lib/rules.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!requireSession(req, res)) return;

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: "VAPID keys not configured" });
  }
  webpush.setVapidDetails(
    VAPID_SUBJECT || "mailto:petalping@example.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  const [stored, prediction] = await Promise.all([
    readJSON(PATHS.subscription),
    readJSON(PATHS.prediction),
  ]);

  if (!stored?.subscription) {
    return res.status(409).json({ error: "this device is not registered for push yet" });
  }

  const choice = prediction ? selectNotification(prediction, {}, new Date()) : null;
  const payload = choice
    ? { title: choice.title, body: choice.body, tag: "test-" + choice.rule.id, url: "/" }
    : { title: "Petal Ping", body: "Test notification — no rule matched today.", tag: "test", url: "/" };

  try {
    await webpush.sendNotification(stored.subscription, JSON.stringify(payload));
    return res.status(200).json({ sent: true, rule: choice?.rule.id || null, ...payload });
  } catch (err) {
    // 404/410 means the phone's subscription is dead -- it must re-subscribe.
    const gone = err.statusCode === 404 || err.statusCode === 410;
    if (gone) {
      await writeJSON(PATHS.subscription, { subscription: null, expired_at: new Date().toISOString() });
    }
    return res.status(502).json({
      sent: false,
      error: err.body || err.message,
      statusCode: err.statusCode,
      subscriptionExpired: gone,
    });
  }
}
