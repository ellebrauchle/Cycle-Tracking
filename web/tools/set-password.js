#!/usr/bin/env node
// Sets the companion-view password.
//
//   node tools/set-password.js
//
// Writes APP_PASSWORD_HASH and SESSION_SECRET straight into ../.env (which is
// git-ignored). Nothing secret is printed, so no credential ends up in terminal
// scrollback. The password itself is never stored -- only a scrypt hash of it.
//
// After running this, push the same two values to Vercel:
//   vercel env add APP_PASSWORD_HASH production
//   vercel env add SESSION_SECRET production
// (both will be printed on request with --show, for pasting into Vercel)

import crypto from "node:crypto";
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../lib/auth.js";

const ENV = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".env");
const show = process.argv.includes("--show");

function upsert(text, key, value) {
  const line = `${key}='${value}'`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(text) ? text.replace(re, line) : text.replace(/\n*$/, "\n") + line + "\n";
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl._writeToOutput = function (s) {
  if (rl.stdoutMuted && !s.includes("password")) return;
  rl.output.write(s);
};

rl.question("Choose a password for the companion view: ", (password) => {
  rl.stdoutMuted = false;
  console.log();
  if (password.length < 10) {
    console.error("Too short -- use at least 10 characters. Nothing written.");
    rl.close();
    process.exit(1);
  }

  let text = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : "";
  const hash = hashPassword(password);
  const existingSecret = text.match(/^SESSION_SECRET='?([^'\n]+)'?$/m)?.[1];
  const secret = existingSecret || crypto.randomBytes(32).toString("base64url");

  text = upsert(text, "APP_PASSWORD_HASH", hash);
  text = upsert(text, "SESSION_SECRET", secret);
  fs.writeFileSync(ENV, text, { mode: 0o600 });

  console.log("Password set. .env updated:");
  console.log("  APP_PASSWORD_HASH  " + (text.includes(hash) ? "written" : "FAILED"));
  console.log("  SESSION_SECRET     " + (existingSecret ? "kept existing" : "generated"));
  console.log("\nNext: add the same two values to Vercel.");
  console.log("  node tools/set-password.js --show   # prints them for pasting");

  if (show) {
    console.log("\n--- values (treat as secrets) ---");
    console.log(`APP_PASSWORD_HASH=${hash}`);
    console.log(`SESSION_SECRET=${secret}`);
  }
  rl.close();
});
rl.stdoutMuted = true;
