/**
 * Session-Cookie: HMAC-signiertes JSON-Payload.
 * Payload: { ts: number, sid: number | null, adm: 0 | 1 }
 *
 * - sid = Setter-ID (null = nur via APP_PASSWORD eingeloggter Bootstrap-Admin)
 * - adm = 1 wenn Admin-Rolle (Suche/Settings/Team-Verwaltung erlaubt)
 *
 * Env-Vars:
 *   APP_SECRET   – Random-String, signiert das Cookie (Pflicht)
 *   APP_PASSWORD – optional: Bootstrap-Master-Passwort, mit dem man auch ohne
 *                  angelegten Setter-Account als Admin reinkommt (für Setup)
 *
 * Web-Crypto-API → läuft in Edge- UND Node-Runtime.
 */

export const COOKIE_NAME = "soreleads_auth";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 Tage

export interface SessionPayload {
  ts: number;
  sid: number | null;
  adm: 0 | 1;
}

function b64urlFromBytes(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlEncodeString(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecodeString(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const normal = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(normal);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
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
  return Boolean(process.env.APP_SECRET);
}

export function hasBootstrapPassword(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

export async function signSession(payload: Omit<SessionPayload, "ts">): Promise<string> {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET fehlt");
  const full: SessionPayload = { ts: Date.now(), ...payload };
  const body = b64urlEncodeString(JSON.stringify(full));
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}

export async function verifySession(value: string | undefined): Promise<SessionPayload | null> {
  if (!value) return null;
  const secret = process.env.APP_SECRET;
  if (!secret) return null;

  const [body, sig] = value.split(".");
  if (!body || !sig) return null;

  const expected = await hmac(secret, body);
  if (!timingSafeEqual(sig, expected)) return null;

  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(b64urlDecodeString(body)) as SessionPayload;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.ts !== "number") return null;
  if (Date.now() - parsed.ts > COOKIE_MAX_AGE * 1000) return null;
  return parsed;
}

export function checkBootstrapPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(password, expected);
}
