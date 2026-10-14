#!/usr/bin/env node
// Turns a password into a scrypt hash for APP_PASSWORD_HASH, and generates a
// SESSION_SECRET. Run locally; the password itself is never stored or sent.
//
//   node tools/set-password.js
//
// Paste the two printed lines into .env, then add the same two values to the
// Vercel project's environment variables.

import crypto from "node:crypto";
import readline from "node:readline";
import { hashPassword } from "../lib/auth.js";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Hide the typed password: rewrite the prompt line instead of echoing.
rl._writeToOutput = function (s) {
  if (rl.stdoutMuted && !s.includes("Choose")) return;
  rl.output.write(s);
};

rl.question("Choose a password for the companion view: ", (password) => {
  rl.stdoutMuted = false;
  console.log();
  if (password.length < 10) {
    console.error("Too short — use at least 10 characters. Nothing written.");
    rl.close();
    process.exit(1);
  }
  console.log("Add these to .env and to the Vercel project's env vars:\n");
  console.log(`APP_PASSWORD_HASH='${hashPassword(password)}'`);
  console.log(`SESSION_SECRET='${crypto.randomBytes(32).toString("base64url")}'`);
  console.log("\n(.env is git-ignored. The password itself is not stored anywhere.)");
  rl.close();
});
rl.stdoutMuted = true;
