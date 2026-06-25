import { NextResponse } from "next/server";
import { calcomConfigured, createBooking } from "@/lib/calcom";
import { dbGetLead, dbUpdateLead } from "@/lib/db";
import { getCurrentSetterId } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * POST /api/calcom/book
 * Body: { uid, start, attendeeEmail, attendeeName? }
 *
 * Bucht einen echten Cal.com-Termin für den Lead, setzt ihn auf
 * "call_scheduled" (+ next_action_at = Termin) und hinterlegt die Buchungs-ID.
 * Der Statuswechsel triggert den bestehenden Sales-Hub-Webhook.
 */
export async function POST(req: Request) {
  if (!calcomConfigured()) {
    return NextResponse.json(
      { error: "Cal.com ist nicht konfiguriert (CALCOM_API_KEY / CALCOM_EVENT_TYPE_ID fehlen)" },
      { status: 503 },
    );
  }

  let body: { uid?: string; start?: string; attendeeEmail?: string; attendeeName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body" }, { status: 400 });
  }

  const { uid, start, attendeeEmail, attendeeName } = body;
  if (!uid || !start || !attendeeEmail) {
    return NextResponse.json({ error: "uid, start und attendeeEmail erforderlich" }, { status: 400 });
  }

  try {
    const lead = await dbGetLead(uid);
    if (!lead) return NextResponse.json({ error: "Lead nicht gefunden" }, { status: 404 });

    const setterId = await getCurrentSetterId();
    const booking = await createBooking({
      start,
      attendeeName: attendeeName?.trim() || lead.firmenname || "Interessent",
      attendeeEmail: attendeeEmail.trim(),
    });

    const updated = await dbUpdateLead(
      uid,
      {
        leadStatus: "call_scheduled",
        nextActionAt: booking.start,
        setLastContact: true,
        qualifiedInfo: {
          calBookingUid: booking.uid,
          calBookingUrl: booking.url,
          calBookedAt: new Date().toISOString(),
        },
      },
      setterId,
    );

    return NextResponse.json({ booking, lead: updated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
