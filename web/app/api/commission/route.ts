import { NextResponse } from "next/server";
import { dbCommissions } from "@/lib/db";
import { getSessionInfo } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 10;

/**
 * GET /api/commission
 *
 * Liefert die Provisions-Übersicht:
 *  - `me`:   die eigene Zusammenfassung des eingeloggten Setters (oder null,
 *            wenn Bootstrap-Admin ohne Setter-Profil).
 *  - `team`: die komplette Team-Aufschlüsselung – NUR für Admins.
 *
 * Nicht admin-only abgesichert (Middleware), damit jeder Setter seine eigene
 * Provision sehen kann; die Team-Daten werden hier in der Route admin-gated.
 */
export async function GET() {
  try {
    const info = await getSessionInfo();
    const all = await dbCommissions();

    const me = info.setterId != null ? all.find((c) => c.setterId === info.setterId) ?? null : null;
    const team = info.isAdmin ? all : null;

    return NextResponse.json({ me, team });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
