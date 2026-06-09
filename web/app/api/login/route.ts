import { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  COOKIE_MAX_AGE,
  checkBootstrapPassword,
  hasBootstrapPassword,
  isAuthConfigured,
  signSession,
} from "@/lib/auth";
import { dbCountSetters, dbVerifySetterPin } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Login-Modi:
 *
 * 1. Setter-Login: { setterId, pin } → PIN aus DB checken
 * 2. Bootstrap-Admin: { password } → APP_PASSWORD (Setup, wenn noch keine Setter da)
 */
export async function POST(req: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "Auth nicht konfiguriert (APP_SECRET fehlt)" }, { status: 500 });
  }

  let body: { setterId?: number; pin?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  // 1) Setter-Login
  if (body.setterId && body.pin) {
    const setter = await dbVerifySetterPin(Number(body.setterId), String(body.pin));
    if (!setter) {
      return NextResponse.json({ error: "Falsche PIN" }, { status: 401 });
    }
    const token = await signSession({ sid: setter.id, adm: setter.isAdmin ? 1 : 0 });
    const res = NextResponse.json({
      ok: true,
      setterId: setter.id,
      name: setter.name,
      isAdmin: setter.isAdmin,
    });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
    return res;
  }

  // 2) Bootstrap-Admin (für Setup, wenn noch kein Setter existiert)
  if (body.password) {
    if (!hasBootstrapPassword()) {
      return NextResponse.json({ error: "Bootstrap-Login nicht konfiguriert" }, { status: 400 });
    }
    if (!checkBootstrapPassword(body.password)) {
      return NextResponse.json({ error: "Falsches Passwort" }, { status: 401 });
    }
    const count = await dbCountSetters().catch(() => 0);
    // Bootstrap-Login bleibt immer erlaubt; nützlich um vergessene PINs zurückzusetzen.
    const token = await signSession({ sid: null, adm: 1 });
    const res = NextResponse.json({ ok: true, isAdmin: true, bootstrap: true, settersExist: count > 0 });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
    return res;
  }

  return NextResponse.json({ error: "setterId+pin oder password erforderlich" }, { status: 400 });
}
