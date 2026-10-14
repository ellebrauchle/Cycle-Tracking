// Exchanges the password for a session cookie.
//
// Failed attempts are delayed and counted in the store, because this endpoint
// is public and guards health data. scrypt alone makes brute force slow; the
// lockout makes it pointless.

import { verifyPassword, createSessionToken, sessionCookie, clearedCookie } from "../lib/auth.js";
import { readJSON, writeJSON } from "../lib/store.js";

const ATTEMPTS = "login-attempts.json";
const MAX_FAILURES = 8;
const LOCKOUT_MINUTES = 15;

export default async function handler(req, res) {
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearedCookie());
    return res.status(200).json({ ok: true, signedOut: true });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { APP_PASSWORD_HASH, SESSION_SECRET } = process.env;
  if (!APP_PASSWORD_HASH || !SESSION_SECRET) {
    return res.status(500).json({ error: "password not configured on the server" });
  }

  const state = (await readJSON(ATTEMPTS, { failures: 0, until: null })) || {};
  if (state.until && new Date(state.until) > new Date()) {
    const mins = Math.ceil((new Date(state.until) - Date.now()) / 60000);
    return res.status(429).json({ error: `too many attempts — try again in ${mins} min` });
  }

  const password = req.body?.password;
  if (typeof password !== "string" || !password) {
    return res.status(400).json({ error: "no password given" });
  }

  if (!verifyPassword(password, APP_PASSWORD_HASH)) {
    const failures = (state.failures || 0) + 1;
    const locked = failures >= MAX_FAILURES;
    await writeJSON(ATTEMPTS, {
      failures: locked ? 0 : failures,
      until: locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString() : null,
      last_failure_at: new Date().toISOString(),
    });
    // Blunt the timing signal a little, and slow down scripted guessing.
    await new Promise((r) => setTimeout(r, 400));
    return res.status(401).json({
      error: "wrong password",
      attemptsRemaining: locked ? 0 : MAX_FAILURES - failures,
    });
  }

  await writeJSON(ATTEMPTS, { failures: 0, until: null });
  res.setHeader("Set-Cookie", sessionCookie(createSessionToken(SESSION_SECRET)));
  return res.status(200).json({ ok: true });
}
