// Password gate for the companion view (D8: anything exposed needs auth).
//
// Two pieces:
//   1. verifyPassword -- checks a typed password against APP_PASSWORD_HASH.
//      The server never stores the password itself, only a scrypt hash, so
//      reading the env vars does not hand anyone the password.
//   2. session cookies -- a signed, expiring token so the password is typed
//      once per device rather than on every page load.
//
// Deliberately small: one user, one password, no accounts or reset flow.

import crypto from "node:crypto";

const COOKIE = "pp_session";
const SESSION_DAYS = 90;

// --- password ------------------------------------------------------------

// Format: scrypt$N$r$p$<salt b64>$<hash b64>. Produced by tools/set-password.js.
export function hashPassword(password, salt = crypto.randomBytes(16)) {
  const N = 16384, r = 8, p = 1;
  const hash = crypto.scryptSync(password, salt, 32, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, N, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");

  let actual;
  try {
    actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p),
    });
  } catch {
    return false;
  }

  // Constant-time: a plain === leaks how much of the hash matched via timing.
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// --- sessions ------------------------------------------------------------

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSessionToken(secret) {
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  return `${expires}.${sign(String(expires), secret)}`;
}

export function verifySessionToken(token, secret) {
  if (!token || !secret) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature) return false;
  if (Number(expires) < Date.now()) return false;

  const expected = Buffer.from(sign(expires, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export function sessionCookie(token) {
  // HttpOnly: JavaScript cannot read it, so an injected script cannot steal it.
  // Secure + SameSite=Lax: HTTPS only, and not sent from other sites' requests.
  return [
    `${COOKIE}=${token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_DAYS * 86400}`,
  ].join("; ");
}

export function clearedCookie() {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function readCookie(req, name) {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/**
 * Guard for any endpoint that returns personal data. Returns true if the
 * request carries a valid session; otherwise responds 401 and returns false.
 */
export function requireSession(req, res) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    res.status(500).json({ error: "SESSION_SECRET not configured" });
    return false;
  }
  if (!verifySessionToken(readCookie(req, COOKIE), secret)) {
    res.status(401).json({ error: "not signed in" });
    return false;
  }
  return true;
}
