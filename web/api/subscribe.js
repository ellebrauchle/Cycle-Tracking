// Stores the phone's push subscription so scheduled jobs can reach it later,
// then sends one confirmation push so the user sees it worked.
//
// (The first version of this was deliberately stateless -- it used the
// subscription once and forgot it. That proved push worked; now it has to
// persist, or nothing scheduled can ever send.)

import webpush from "web-push";
import { readJSON, writeJSON, PATHS } from "../lib/store.js";

function configureVapid() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    VAPID_SUBJECT || "mailto:petalping@example.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  return true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!configureVapid()) {
    return res.status(500).json({ error: "VAPID keys not configured on the server" });
  }

  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "no subscription in request body" });
  }

  try {
    await writeJSON(PATHS.subscription, {
      subscription,
      saved_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: "could not save subscription: " + err.message });
  }

  // Confirmation push. If this fails the subscription is still saved -- say so
  // rather than pretending the whole thing failed.
  const prediction = await readJSON(PATHS.prediction);
  const body = prediction
    ? `Saved. Next period expected ${prediction.window_start} to ${prediction.window_end}.`
    : "Saved. You'll get your first real notification once cycle data is uploaded.";

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title: "Petal Ping is set up", body, tag: "setup", url: "/" })
    );
    return res.status(200).json({ ok: true, pushed: true });
  } catch (err) {
    return res.status(200).json({
      ok: true,
      pushed: false,
      note: "subscription saved but the test push failed",
      error: err.body || err.message,
    });
  }
}
