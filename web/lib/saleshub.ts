import type { DbLead, LeadStatus } from "./types";

// =============================================================================
// Sales-Hub-Webhook
// =============================================================================
// Pusht qualifizierte Leads an den "Volles Studio Sales Hub", sobald ihr Status
// auf "interested" oder "call_scheduled" wechselt.
//
// Vertrag (vom Hub vorgegeben):
//   POST <SALESHUB_WEBHOOK_URL>            (z.B. .../api/webhooks/scraper-leads)
//   Header: x-webhook-secret: <SALESHUB_WEBHOOK_SECRET>
//   Body:   { "leads": [ { company_name, phone, emails[], website,
//                          category, city, contact_name } ] }
//
// Konfiguration (Vercel → sorex-leadscraper → Environment Variables):
//   SALESHUB_WEBHOOK_URL     – Endpoint des Sales Hub (Pflicht, sonst No-Op)
//   SALESHUB_WEBHOOK_SECRET  – Shared Secret für den x-webhook-secret-Header
//   SALESHUB_WEBHOOK_TIMEOUT – optional, ms (Default 3500)
//
// Leer = No-Op (lokal/Preview passiert nichts).

/** Status-Übergänge, die einen Push auslösen. */
const NOTIFY_ON: ReadonlySet<LeadStatus> = new Set<LeadStatus>([
  "interested",
  "call_scheduled",
]);

/**
 * Feuert den Webhook bei einem Status-Wechsel in eine qualifizierte Stufe.
 *
 * Blockiert den Status-Save nie fachlich: Das UPDATE auf `leads` ist beim
 * Aufruf bereits committed. Wir warten zwar auf den Webhook (Serverless-
 * Functions werden nach der Response eingefroren), aber mit hartem Timeout und
 * ohne je zu werfen – schlägt der Hub fehl, bleibt der Lead korrekt gespeichert.
 *
 * @returns true bei 2xx vom Hub; sonst false (auch bei No-Op).
 */
export async function notifySalesHub(
  lead: DbLead,
  _fromStatus: LeadStatus | null,
  toStatus: LeadStatus,
): Promise<boolean> {
  if (!NOTIFY_ON.has(toStatus)) return false;

  const url = process.env.SALESHUB_WEBHOOK_URL?.trim();
  const secret = process.env.SALESHUB_WEBHOOK_SECRET?.trim();
  if (!url || !secret) return false; // nicht konfiguriert → No-Op

  // Feld-Mapping auf den vom Hub erwarteten Vertrag (snake_case, emails als Array).
  const body = JSON.stringify({
    leads: [
      {
        company_name: lead.firmenname || null,
        phone: lead.telefon || null,
        emails: lead.email ? [lead.email] : [],
        website: lead.webseite || null,
        category: lead.kategorie || null,
        city: lead.ort || null,
        contact_name: lead.qualifiedInfo?.ansprechpartner || null,
      },
    ],
  });

  const timeoutMs = Number(process.env.SALESHUB_WEBHOOK_TIMEOUT ?? 3500);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": secret,
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
