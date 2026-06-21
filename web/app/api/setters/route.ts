import { NextResponse } from "next/server";
import { dbCreateSetter, dbDeleteSetter, dbListSetters, dbUpdateSetter } from "@/lib/db";
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

export async function GET() {
  const guard = await requireAdmin();
  if (guard) return guard;
  try {
    const setters = await dbListSetters();
    return NextResponse.json({ setters });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard) return guard;

  let body: {
    name?: string;
    pin?: string;
    color?: string;
    isAdmin?: boolean;
    settingFee?: number;
    closingFee?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }
  if (!body.name || !body.pin) {
    return NextResponse.json({ error: "name und pin sind Pflicht" }, { status: 400 });
  }
  const feeError = validateFees(body);
  if (feeError) return NextResponse.json({ error: feeError }, { status: 400 });
  try {
    const setter = await dbCreateSetter({
      name: body.name,
      pin: body.pin,
      color: body.color,
      isAdmin: body.isAdmin ?? false,
      settingFee: body.settingFee,
      closingFee: body.closingFee,
    });
    return NextResponse.json({ setter });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Validiert Setting-/Closing-Fee (Zahl ≥ 0), falls gesetzt. */
function validateFees(b: { settingFee?: number; closingFee?: number }): string | null {
  for (const [key, val] of [
    ["settingFee", b.settingFee],
    ["closingFee", b.closingFee],
  ] as const) {
    if (val !== undefined && (!Number.isFinite(val) || val < 0)) {
      return `${key} muss eine Zahl ≥ 0 sein`;
    }
  }
  return null;
}

export async function PATCH(req: Request) {
  const guard = await requireAdmin();
  if (guard) return guard;

  let body: {
    id?: number;
    name?: string;
    pin?: string;
    color?: string;
    isAdmin?: boolean;
    settingFee?: number;
    closingFee?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  const feeError = validateFees(body);
  if (feeError) return NextResponse.json({ error: feeError }, { status: 400 });
  try {
    await dbUpdateSetter(body.id, {
      name: body.name,
      pin: body.pin,
      color: body.color,
      isAdmin: body.isAdmin,
      settingFee: body.settingFee,
      closingFee: body.closingFee,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const guard = await requireAdmin();
  if (guard) return guard;

  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  }
  try {
    await dbDeleteSetter(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
