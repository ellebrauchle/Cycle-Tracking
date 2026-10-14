// Thin wrapper over Vercel Blob so the rest of the code just reads and writes
// JSON by name. The store is PRIVATE -- blobs are not reachable by URL without
// the token, which matters because this holds health data (D8).

import { put, get } from "@vercel/blob";

export const PATHS = {
  subscription: "push-subscription.json", // where to send notifications
  prediction: "prediction.json",          // uploaded by ingest.py from the laptop
  sent: "sent-log.json",                  // what we already sent, to avoid repeats
  feedback: "feedback.json",              // thumbs up/down history
};

export async function readJSON(pathname, fallback = null) {
  try {
    // useCache:false because the cron must see what ingest.py just uploaded,
    // not a cached copy from before.
    const res = await get(pathname, { access: "private", useCache: false });
    if (!res || !res.stream) return fallback;
    return await new Response(res.stream).json();
  } catch (err) {
    if (err?.name === "BlobNotFoundError") return fallback;
    throw err;
  }
}

export async function writeJSON(pathname, data) {
  await put(pathname, JSON.stringify(data, null, 2), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
  });
}
