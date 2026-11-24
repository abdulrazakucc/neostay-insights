/* Encrypted data access.

   The hosted site is public, so the data files are never published in plain form. `npm run encrypt`
   (scripts/encrypt-data.mjs) gzips and encrypts each JSON file (and the PDF guide) with AES-256-GCM. The key comes from the
   username and password through PBKDF2-SHA256. Only the ciphertext (public/data/*.enc) and the salt
   (public/data/vault.json) are published. A wrong username or password fails the GCM check, so nothing
   decrypts.

   The derived key lives in memory and in sessionStorage (this tab only), so a reload keeps the session.
   Signing out or closing the tab clears it. */

type Vault = { v: number; kdf: string; iterations: number; salt: string; files: string[] };

const SESSION_KEY = "neostay-insights-key";
let key: CryptoKey | null = null;
let vault: Vault | null = null;
const cache = new Map<string, Promise<any>>();

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));

async function loadVault(): Promise<Vault> {
  if (vault) return vault;
  const r = await fetch("data/vault.json", { cache: "no-store" });
  if (!r.ok) throw new Error("The encrypted data is missing from this site.");
  vault = (await r.json()) as Vault;
  return vault;
}

async function deriveKey(username: string, password: string, v: Vault): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${username.trim().toLowerCase()}\n${password}`), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: b64(v.salt), iterations: v.iterations },
    material, { name: "AES-GCM", length: 256 }, true, ["decrypt"],
  );
}

function gunzip(bytes: ArrayBuffer): Response {
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")));
}

async function decryptBytes(path: string, k: CryptoKey): Promise<ArrayBuffer> {
  const r = await fetch(`data/${path}.enc`, { cache: "no-store" });
  if (!r.ok) throw new Error(`Missing data file: ${path}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, k, buf.slice(12));
}

async function decryptFile(path: string, k: CryptoKey): Promise<any> {
  return JSON.parse(await gunzip(await decryptBytes(path, k)).text());
}

/* Sign in: derive the key and prove it by decrypting the center index. */
export async function signIn(username: string, password: string): Promise<void> {
  const v = await loadVault();
  const k = await deriveKey(username, password, v);
  try {
    cache.set("centers/index.json", decryptFile("centers/index.json", k));
    await cache.get("centers/index.json");
  } catch {
    cache.clear();
    throw new Error("Username or password is not correct.");
  }
  key = k;
  try { sessionStorage.setItem(SESSION_KEY, toB64(await crypto.subtle.exportKey("raw", k))); } catch { /* storage unavailable */ }
}

/* Restore a session from this tab's storage after a reload. */
export async function resume(): Promise<boolean> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const k = await crypto.subtle.importKey("raw", b64(raw), { name: "AES-GCM" }, false, ["decrypt"]);
    cache.set("centers/index.json", decryptFile("centers/index.json", k));
    await cache.get("centers/index.json");
    key = k;
    return true;
  } catch {
    cache.clear();
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
    return false;
  }
}

export function signOut() {
  key = null;
  cache.clear();
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
}

/* Read one data file, e.g. "insights.json" or "centers/center-3.json". */
export function loadData(path: string): Promise<any> {
  if (!key) return Promise.reject(new Error("Not signed in."));
  if (!cache.has(path)) {
    const p = decryptFile(path, key);
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path)!;
}

/* Read one encrypted document, e.g. "guide.pdf", as a Blob the browser can show or save. */
const TYPES: Record<string, string> = { pdf: "application/pdf" };
export async function loadFile(path: string): Promise<Blob> {
  if (!key) throw new Error("Not signed in.");
  const bytes = await gunzip(await decryptBytes(path, key)).arrayBuffer();
  return new Blob([bytes], { type: TYPES[path.split(".").pop() ?? ""] ?? "application/octet-stream" });
}
