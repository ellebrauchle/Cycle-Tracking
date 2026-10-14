// The daily job. Runs on Vercel's schedule (see vercel.json) regardless of
// whether the laptop is open.
//
// Reads the stored prediction and push subscription, asks the rules engine
// whether anything is worth saying today, and sends at most one notification.

import webpush from "web-push";
import { readJSON, writeJSON, PATHS } from "../lib/store.js";
import { selectNotification } from "../lib/rules.js";

export default async function handler(req, res) {
  // Vercel signs its own cron requests. Allow a manual run with the upload
  // secret too, so this can be tested without waiting a day.
  const isVercelCron = Boolean(req.headers["x-vercel-cron"]);
  const hasSecret =
    process.env.UPLOAD_SECRET && req.headers["x-upload-secret"] === process.env.UPLOAD_SECRET;
  if (!isVercelCron && !hasSecret) {
    return res.status(401).json({ error: "unauthorized" });
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

  const [stored, prediction, sentLog] = await Promise.all([
    readJSON(PATHS.subscription),
    readJSON(PATHS.prediction),
    readJSON(PATHS.sent, {}),
  ]);

  if (!stored?.subscription) {
    return res.status(200).json({ sent: false, reason: "no push subscription saved yet" });
  }
  if (!prediction) {
    return res.status(200).json({ sent: false, reason: "no prediction uploaded yet" });
  }

  const dryRun = req.query?.dry === "1";
  const choice = selectNotification(prediction, sentLog, new Date());

  if (!choice) {
    return res.status(200).json({ sent: false, reason: "no rule matched today" });
  }

  const summary = {
    rule: choice.rule.id,
    title: choice.title,
    body: choice.body,
    cycle_day: choice.ctx.cycleDay,
    phase: choice.ctx.phase,
    days_until_window: choice.ctx.daysUntilWindow,
  };

  if (dryRun) return res.status(200).json({ sent: false, dryRun: true, would_send: summary });

  try {
    await webpush.sendNotification(
      stored.subscription,
      JSON.stringify({
        title: choice.title,
        body: choice.body,
        tag: choice.rule.id,
        url: "/",
      })
    );
  } catch (err) {
    // 404/410 means the phone's subscription is dead -- it must re-subscribe.
    const gone = err.statusCode === 404 || err.statusCode === 410;
    if (gone) await writeJSON(PATHS.subscription, { subscription: null, expired_at: new Date().toISOString() });
    return res.status(502).json({
      sent: false,
      error: err.body || err.message,
      statusCode: err.statusCode,
      subscriptionExpired: gone,
    });
  }

  sentLog[choice.rule.id] = new Date().toISOString().slice(0, 10);
  await writeJSON(PATHS.sent, sentLog);

  return res.status(200).json({ sent: true, ...summary });
}
