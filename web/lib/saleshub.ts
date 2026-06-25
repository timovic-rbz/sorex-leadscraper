import { createHmac } from "node:crypto";
import type { DbLead, LeadStatus } from "./types";

// =============================================================================
// Sales-Hub-Webhook
// =============================================================================
// Pusht qualifizierte Leads an den "Volles Studio Sales Hub", sobald ihr Status
// auf "interested" oder "call_scheduled" wechselt. Dort laufen Closing-Skript,
// Cal.com-Termin + Erinnerungen (24h/2h) und die weitere Pipeline.
//
// Konfiguration (Vercel → sorex-leadscraper → Environment Variables):
//   SALESHUB_WEBHOOK_URL     – HTTPS-Endpoint des Sales Hub (Pflicht, sonst No-Op)
//   SALESHUB_WEBHOOK_SECRET  – Shared Secret für die HMAC-Signatur (Pflicht)
//   SALESHUB_WEBHOOK_TIMEOUT – optional, ms (Default 3500)
//
// Ist keine URL/Secret gesetzt, ist der Aufruf ein No-Op – lokal und in
// Vorschau-Deployments passiert also nichts.

/** Status-Übergänge, die einen Push auslösen. */
const NOTIFY_ON: ReadonlySet<LeadStatus> = new Set<LeadStatus>([
  "interested",
  "call_scheduled",
]);

export interface SalesHubPayload {
  /** Stabiler Lead-Schlüssel (Primary Key) – nutzt der Hub als Idempotenz-/Upsert-Key. */
  uid: string;
  firmenname: string | null;
  telefon: string | null;
  email: string | null;
  ort: string | null;
  /** snake_case-DB-Wert: "interested" | "call_scheduled". */
  lead_status: LeadStatus;
  /** Bei "call_scheduled" das Wunsch-/Termindatum (ISO), sonst ggf. Wiedervorlage. */
  next_action_at: string | null;
  /** Vorheriger Status – Kontext für den Hub (z.B. Erst-Eintritt vs. Re-Entry). */
  from_status: LeadStatus | null;
  /** Zeitpunkt des Status-Wechsels (ISO) – zusammen mit uid dedupe-fähig. */
  event_at: string;
}

/**
 * Feuert den Webhook bei einem Status-Wechsel in eine qualifizierte Stufe.
 *
 * Bewusst so gebaut, dass es den Status-Save NIE fachlich blockiert:
 *  - Das UPDATE auf `leads` ist beim Aufruf bereits committed.
 *  - Wir warten zwar auf den Webhook (Serverless-Functions werden nach der
 *    Response eingefroren, ein un-awaiteter Fetch würde sonst evtl. nie raus),
 *    ABER mit hartem Timeout und ohne je zu werfen. Schlägt der Hub fehl,
 *    bleibt der Lead trotzdem korrekt gespeichert.
 *
 * @returns true, wenn der Hub 2xx geliefert hat; sonst false (auch bei No-Op).
 */
export async function notifySalesHub(
  lead: DbLead,
  fromStatus: LeadStatus | null,
  toStatus: LeadStatus,
): Promise<boolean> {
  if (!NOTIFY_ON.has(toStatus)) return false;

  const url = process.env.SALESHUB_WEBHOOK_URL?.trim();
  const secret = process.env.SALESHUB_WEBHOOK_SECRET?.trim();
  if (!url || !secret) return false; // nicht konfiguriert → No-Op

  const payload: SalesHubPayload = {
    uid: lead.uid,
    firmenname: lead.firmenname || null,
    telefon: lead.telefon || null,
    email: lead.email || null,
    ort: lead.ort || null,
    lead_status: toStatus,
    next_action_at: lead.nextActionAt ?? null,
    from_status: fromStatus,
    event_at: new Date().toISOString(),
  };

  // Stripe-Style-Signatur: HMAC-SHA256 über `${timestamp}.${body}`.
  // Der Hub prüft so Echtheit UND Replay (timestamp-Fenster, z.B. ±5 min).
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const timeoutMs = Number(process.env.SALESHUB_WEBHOOK_TIMEOUT ?? 3500);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-saleshub-timestamp": timestamp,
        "x-saleshub-signature": `sha256=${signature}`,
        "x-saleshub-event": "lead.qualified",
      },
      body,
      signal: ac.signal,
    });
    if (!res.ok) {
      console.error(`[saleshub] Webhook ${res.status} für Lead ${lead.uid}`);
      return false;
    }
    return true;
  } catch (e) {
    // Timeout/Netzfehler: nur loggen, niemals werfen.
    console.error(`[saleshub] Webhook-Fehler für Lead ${lead.uid}:`, (e as Error).message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
