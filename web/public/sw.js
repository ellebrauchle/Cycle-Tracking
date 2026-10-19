// Petal Ping service worker.
// Minimal on purpose: this exists to prove push delivery works on iOS.
// Caching and offline support come later, once the app has real UI.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Petal Ping";
  const options = {
    body: payload.body || "Test notification.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "petal-ping",
    data: { url: payload.url || "/" },
    // Thumbs up/down on notifications (PRD Q6). iOS support for actions is
    // inconsistent; they are declared here so the plumbing exists, and the
    // notification still works where they are ignored.
    actions: [
      { action: "useful", title: "👍 Useful" },
      { action: "not-useful", title: "👎 Not useful" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "useful" || event.action === "not-useful") {
    event.waitUntil(
      fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: event.action,
          tag: event.notification.tag,
          at: new Date().toISOString(),
        }),
      }).catch(() => {
        // Feedback is best-effort; never let it break the notification tap.
      })
    );
    return;
  }

  // Tapping the notification body opens the app with the rule tag attached, so
  // the view can ask for feedback on THIS notification. iOS does not render
  // notification action buttons, so this is the path that actually gets used.
  const base = (event.notification.data && event.notification.data.url) || "/";
  const tag = event.notification.tag || "";
  // The payload may already carry its own query (tone samples include the text
  // they sent). Only append ?note= when it is not already there.
  let url = base;
  if (tag && !base.includes("note=")) {
    url = base + (base.includes("?") ? "&" : "?") + "note=" + encodeURIComponent(tag);
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client && "navigate" in client) {
          return client.focus().then((c) => (tag ? c.navigate(url) : c));
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
