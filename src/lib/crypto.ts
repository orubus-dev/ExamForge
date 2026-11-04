// Web Crypto helpers — safe for edge runtime and browser.

export function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}

export function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function utf8Decode(b: ArrayBuffer | Uint8Array): string {
  return new TextDecoder().decode(b);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64Encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function base64Decode(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** S256 code challenge for OAuth PKCE. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8Encode(verifier) as unknown as ArrayBuffer);
  return base64UrlEncode(new Uint8Array(digest));
}

// ── Channel encryption (AES-GCM, done in the browser) ────────────────────────

export async function createChannelKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportChannelKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return base64Encode(new Uint8Array(raw));
}

export async function importChannelKey(b64: string): Promise<CryptoKey> {
  const raw = base64Decode(b64);
  return crypto.subtle.importKey(
    "raw",
    raw as unknown as ArrayBuffer,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

/** Seal text → "b64url(iv).b64url(ciphertext)" */
export async function sealText(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    utf8Encode(plaintext) as unknown as ArrayBuffer
  );
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ct))}`;
}

export async function openText(key: CryptoKey, sealed: string): Promise<string> {
  const [ivB64, ctB64] = sealed.split(".");
  if (!ivB64 || !ctB64) throw new Error("bad_ciphertext");
  const iv = base64Decode(ivB64);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    base64Decode(ctB64) as unknown as ArrayBuffer
  );
  return utf8Decode(pt);
}

export interface SealedBytes {
  iv: string; // b64url
  data: ArrayBuffer;
  size: number;
}

export async function sealBytes(key: CryptoKey, buf: ArrayBuffer): Promise<SealedBytes> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as ArrayBuffer }, key, buf);
  return { iv: base64UrlEncode(iv), data: ct, size: ct.byteLength };
}

export async function openBytes(
  key: CryptoKey,
  data: ArrayBuffer,
  ivB64: string
): Promise<ArrayBuffer> {
  const iv = base64Decode(ivB64);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as unknown as ArrayBuffer }, key, data);
}

// ── Exam PIN hashing (PBKDF2-SHA256, Web Crypto only — edge safe) ────────────
// Stored format: "pbkdf2$<iterations>$<salt-hex>$<hash-hex>".
// The Postgres-side join_exam_by_code RPC can verify the same format with
// pgcrypto: digest(decode(salt,'hex') || pin, 'sha256').
export const PIN_ITERATIONS = 100_000;

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    utf8Encode(pin) as unknown as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as unknown as ArrayBuffer,
      iterations: PIN_ITERATIONS,
    },
    key,
    256
  );
  return `pbkdf2$${PIN_ITERATIONS}$${toHex(salt)}$${toHex(bits)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const saltHex = parts[2];
  const expectHex = parts[3];
  if (!/^[0-9a-f]+$/.test(saltHex) || !/^[0-9a-f]+$/.test(expectHex)) return false;
  const salt = new Uint8Array(saltHex.length / 2);
  for (let i = 0; i < salt.length; i++) {
    salt[i] = parseInt(saltHex.slice(i * 2, i * 2 + 2), 16);
  }
  const key = await crypto.subtle.importKey(
    "raw",
    utf8Encode(pin) as unknown as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as unknown as ArrayBuffer,
      iterations,
    },
    key,
    256
  );
  const hashHex = toHex(bits);
  if (hashHex.length !== expectHex.length) return false;
  // Constant-time-ish compare
  let diff = 0;
  for (let i = 0; i < hashHex.length; i++) {
    diff |= hashHex.charCodeAt(i) ^ expectHex.charCodeAt(i);
  }
  return diff === 0;
}
