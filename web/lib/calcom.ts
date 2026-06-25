// =============================================================================
// Cal.com v2 API – freie Slots holen + Termin buchen
// =============================================================================
// Buchung läuft gegen DENSELBEN Cal.com-Account/Key wie der Sales Hub, damit
// alles in einem Kalender landet. Key NUR aus der Env (nie hardcoden):
//   CALCOM_API_KEY        – Cal.com → Settings → Developer → API Keys
//   CALCOM_EVENT_TYPE_ID  – ID des Termin-Typs fürs Sales-Gespräch
//   CALCOM_TIMEZONE       – optional, Default "Europe/Berlin"

const BASE = "https://api.cal.com/v2";
const API_VERSION = "2026-02-25"; // cal-api-version, vgl. Cal.com v2 Docs

function apiKey(): string {
  const k = process.env.CALCOM_API_KEY?.trim();
  if (!k) throw new Error("CALCOM_API_KEY ist nicht gesetzt");
  return k;
}

function eventTypeId(): number {
  const raw = process.env.CALCOM_EVENT_TYPE_ID?.trim();
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) throw new Error("CALCOM_EVENT_TYPE_ID ist nicht gesetzt/ungültig");
  return n;
}

export function calcomTimeZone(): string {
  return process.env.CALCOM_TIMEZONE?.trim() || "Europe/Berlin";
}

/** true, wenn Key + Event-Type gesetzt sind – sonst ist das Feature ein No-Op. */
export function calcomConfigured(): boolean {
  return Boolean(process.env.CALCOM_API_KEY?.trim() && process.env.CALCOM_EVENT_TYPE_ID?.trim());
}

async function calFetch(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "cal-api-version": API_VERSION,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON-Antwort */
  }
  if (!res.ok) {
    const j = json as { error?: { message?: string }; message?: string } | null;
    const msg = j?.error?.message ?? j?.message ?? text ?? `HTTP ${res.status}`;
    throw new Error(`Cal.com ${res.status}: ${msg}`);
  }
  return json;
}

export interface CalSlot {
  /** ISO-Startzeit des Slots. */
  start: string;
}

/**
 * Freie Slots für den konfigurierten Event-Type in einem Zeitfenster.
 * Defensiv geparst: Cal.com liefert je nach Version ein flaches Array ODER
 * ein nach Datum gruppiertes Objekt zurück.
 */
export async function getSlots(opts: {
  start: string; // ISO/Date – Fensteranfang
  end: string; // ISO/Date – Fensterende
  timeZone?: string;
}): Promise<CalSlot[]> {
  const params = new URLSearchParams({
    eventTypeId: String(eventTypeId()),
    start: opts.start,
    end: opts.end,
    timeZone: opts.timeZone ?? calcomTimeZone(),
  });
  const json = (await calFetch(`/slots?${params.toString()}`, { method: "GET" })) as {
    data?: unknown;
  } | null;
  const data = (json?.data ?? json) as unknown;

  const slots: CalSlot[] = [];
  const pushSlot = (s: unknown) => {
    if (typeof s === "string") slots.push({ start: s });
    else if (s && typeof s === "object" && "start" in s) {
      const v = (s as { start?: unknown }).start;
      if (typeof v === "string") slots.push({ start: v });
    }
  };
  if (Array.isArray(data)) {
    data.forEach(pushSlot);
  } else if (data && typeof data === "object") {
    for (const day of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(day)) day.forEach(pushSlot);
    }
  }
  return slots;
}

export interface CalBookingResult {
  uid: string;
  start: string;
  url: string | null;
}

/** Legt einen echten Termin an (Kalendereintrag + Bestätigungsmail an den Attendee). */
export async function createBooking(opts: {
  start: string; // wird auf UTC normalisiert
  attendeeName: string;
  attendeeEmail: string;
  timeZone?: string;
}): Promise<CalBookingResult> {
  const tz = opts.timeZone ?? calcomTimeZone();
  const body = {
    start: new Date(opts.start).toISOString(), // Cal.com erwartet UTC
    eventTypeId: eventTypeId(),
    attendee: { name: opts.attendeeName, email: opts.attendeeEmail, timeZone: tz },
  };
  const json = (await calFetch(`/bookings`, {
    method: "POST",
    body: JSON.stringify(body),
  })) as { data?: Record<string, unknown> } | null;
  const d = (json?.data ?? json ?? {}) as Record<string, unknown>;
  const uid = String(d.uid ?? d.id ?? "");
  const start = typeof d.start === "string" ? d.start : body.start;
  return { uid, start, url: uid ? `https://cal.com/booking/${uid}` : null };
}
