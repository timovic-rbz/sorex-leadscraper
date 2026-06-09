import { NextResponse } from "next/server";
import { dbListSetters } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 10;

/**
 * Öffentliche Liste (nur ID + Name + Farbe) für den Login-Picker.
 * Keine PINs, kein is_admin-Flag – damit nichts geleakt wird, was Brute-Force erleichtert.
 */
export async function GET() {
  try {
    const setters = await dbListSetters();
    return NextResponse.json({
      setters: setters.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
