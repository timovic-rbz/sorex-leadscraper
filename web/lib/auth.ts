/**
 * Minimaler Single-Password-Auth: HMAC-signiertes Cookie, kein DB-Lookup.
 *
 * Env-Vars:
 *   APP_PASSWORD – das Passwort (wird gegen User-Eingabe verglichen)
 *   APP_SECRET   – beliebiger Random-String, signiert das Cookie
 *
 * Web-Crypto-API → läuft in Edge- UND Node-Runtime.
 */

export const COOKIE_NAME = "soreleads_auth";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 Tage

function b64urlFromBytes(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64urlFromBytes(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD && process.env.APP_SECRET);
}

export async function signCookie(): Promise<string> {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET fehlt");
  const ts = String(Date.now());
  const sig = await hmac(secret, ts);
  return `${ts}.${sig}`;
}

export async function verifyCookie(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const secret = process.env.APP_SECRET;
  if (!secret) return false;

  const [ts, sig] = value.split(".");
  if (!ts || !sig) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Date.now() - tsNum > COOKIE_MAX_AGE * 1000) return false;

  const expected = await hmac(secret, ts);
  return timingSafeEqual(sig, expected);
}

export async function checkPassword(password: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(password, expected);
}
