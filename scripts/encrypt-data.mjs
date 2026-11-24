#!/usr/bin/env node
/* Encrypt the plain data files for the hosted site.

   Reads every *.json under data-private/ (git-ignored) and writes, under public/data/:
     <path>.enc   12-byte IV followed by AES-256-GCM ciphertext of the gzipped JSON
     vault.json   KDF parameters and a fresh random salt (no secrets)

   The key is PBKDF2-SHA256("<username lowercased>\n<password>", salt). It matches src/vault.ts.

   Usage:
     NEOSTAY_USER=... NEOSTAY_PASSWORD=... npm run encrypt
   or put both lines in .credentials (git-ignored) as NEOSTAY_USER=... and NEOSTAY_PASSWORD=... */

import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "data-private");
const OUT = join(ROOT, "public", "data");
const ITERATIONS = 600_000;

function credentials() {
  const env = { ...process.env };
  const file = join(ROOT, ".credentials");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2];
    }
  }
  if (!env.NEOSTAY_USER || !env.NEOSTAY_PASSWORD) {
    console.error("Set NEOSTAY_USER and NEOSTAY_PASSWORD (environment or .credentials).");
    process.exit(1);
  }
  if (env.NEOSTAY_PASSWORD.length < 16) {
    console.error("Use a password of at least 16 characters: the data is only as safe as the password.");
    process.exit(1);
  }
  return { user: env.NEOSTAY_USER.trim().toLowerCase(), password: env.NEOSTAY_PASSWORD };
}

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : n.endsWith(".json") ? [p] : [];
  });
}

if (!existsSync(SRC)) {
  console.error("data-private/ is missing. Run `npm run sync-data` first (copies the data from acuity-models).");
  process.exit(1);
}
const { user, password } = credentials();
const salt = randomBytes(16);
const key = pbkdf2Sync(`${user}\n${password}`, salt, ITERATIONS, 32, "sha256");

rmSync(OUT, { recursive: true, force: true });
const files = [];
for (const path of walk(SRC)) {
  const rel = relative(SRC, path).split("\\").join("/");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(gzipSync(readFileSync(path), { level: 9 })), cipher.final(), cipher.getAuthTag()]);
  const out = join(OUT, `${rel}.enc`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.concat([iv, body]));
  files.push(rel);
  console.log(`encrypted ${rel} (${(body.length / 1024).toFixed(0)} KB)`);
}
writeFileSync(join(OUT, "vault.json"), JSON.stringify({ v: 1, kdf: "PBKDF2-SHA256", iterations: ITERATIONS, salt: salt.toString("base64"), files }, null, 2) + "\n");
console.log(`\n${files.length} files encrypted into public/data/.`);
