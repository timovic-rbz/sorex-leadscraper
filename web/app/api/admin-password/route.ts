import { NextResponse } from "next/server";
import { dbClearAdminPassword, dbGetAdminPassword, dbSetAdminPassword } from "@/lib/db";
import { hasBootstrapPassword } from "@/lib/auth";
import { getSessionInfo } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 10;

async function requireAdmin() {
  const info = await getSessionInfo();
  if (!info.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

/** Statusbericht: ist ein UI-Passwort gesetzt? Liegt ein Env-Recovery vor? */
export async function GET() {
  const guard = await requireAdmin();
  if (guard) return guard;
  const dbPw = await dbGetAdminPassword();
  return NextResponse.json({
    dbConfigured: Boolean(dbPw),
    envConfigured: hasBootstrapPassword(),
  });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard) return guard;
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }
  if (!body.password) return NextResponse.json({ error: "password fehlt" }, { status: 400 });
  try {
    await dbSetAdminPassword(body.password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE() {
  const guard = await requireAdmin();
  if (guard) return guard;
  await dbClearAdminPassword();
  return NextResponse.json({ ok: true });
}
