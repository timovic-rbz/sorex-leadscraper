import type { DbLead } from "./types";

// =============================================================================
// WhatsApp-Nachricht "mit allen Infos"
// =============================================================================
// Baut die Nachricht, die der Setter dem Lead nach dem Call schickt (Termin +
// Onboarding-Formular + Video), und den passenden wa.me-Deeplink.
//
// Links (öffentlich, kein Secret) – per NEXT_PUBLIC-Env übersteuerbar:
//   NEXT_PUBLIC_CALCOM_BOOKING_URL   (Default: cal.com/volles-studio/30min)
//   NEXT_PUBLIC_ONBOARDING_FORM_URL  (leer = Zeile entfällt)
//   NEXT_PUBLIC_DEMO_VIDEO_URL       (leer = Zeile entfällt)

const CAL_URL =
  process.env.NEXT_PUBLIC_CALCOM_BOOKING_URL || "https://cal.com/volles-studio/30min";
const FORM_URL = process.env.NEXT_PUBLIC_ONBOARDING_FORM_URL || "";
const VIDEO_URL = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL || "";

/**
 * Telefonnummer → wa.me-Format: nur Ziffern, international, ohne "+".
 * Deutsche Defaults: "0170…" → "49170…", "+49…"/"0049…" → "49…".
 * Gibt null zurück, wenn keine brauchbare Nummer übrig bleibt.
 */
export function toWaNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "49" + d.slice(1);
  d = d.replace(/\D/g, "");
  return d.length >= 8 ? d : null;
}

/** Baut die WhatsApp-Nachricht; Zeilen ohne hinterlegten Link entfallen. */
export function buildWaMessage(lead: DbLead, senderName?: string | null): string {
  const name = lead.qualifiedInfo?.ansprechpartner?.trim() || lead.firmenname?.trim() || "";
  const intro = senderName?.trim()
    ? `Hier ist ${senderName.trim()} von Volles Studio`
    : "Hier ist das Team von Volles Studio";

  const lines: string[] = [];
  lines.push(`Hey${name ? " " + name : ""}! 👋 ${intro} – wie eben besprochen.`);
  lines.push("");
  lines.push(`📅 Dein Termin: ${CAL_URL}`);
  if (FORM_URL) lines.push(`📝 Kurzes Onboarding-Formular (2 Min): ${FORM_URL}`);
  if (VIDEO_URL) lines.push(`🎥 Das Video vorab: ${VIDEO_URL}`);
  lines.push("");
  lines.push(
    "Schau dir kurz das Video an und füll das Formular aus – dann bau ich deine Website schon passend auf dich vor. Bis dann! 🚀",
  );
  return lines.join("\n");
}

/** wa.me-Deeplink mit vorausgefüllter Nachricht; null ohne brauchbare Nummer. */
export function waLink(lead: DbLead, senderName?: string | null): string | null {
  const num = toWaNumber(lead.telefon);
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(buildWaMessage(lead, senderName))}`;
}
