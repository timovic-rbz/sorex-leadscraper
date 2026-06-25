import { NextResponse } from "next/server";
import { calcomConfigured, calcomTimeZone, getSlots } from "@/lib/calcom";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET /api/calcom/slots?date=YYYY-MM-DD
 * Liefert die freien Cal.com-Slots des Tages für den konfigurierten Event-Type.
 */
export async function GET(req: Request) {
  if (!calcomConfigured()) {
    return NextResponse.json(
      { error: "Cal.com ist nicht konfiguriert (CALCOM_API_KEY / CALCOM_EVENT_TYPE_ID fehlen)" },
      { status: 503 },
    );
  }

  const date = new URL(req.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Parameter 'date' (YYYY-MM-DD) erforderlich" }, { status: 400 });
  }

  try {
    // Cal.com /slots: `end` ist exklusiv (Folgetag), Daten als YYYY-MM-DD.
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const slots = await getSlots({ start: date, end: next.toISOString().slice(0, 10) });
    return NextResponse.json({ slots, timeZone: calcomTimeZone() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
