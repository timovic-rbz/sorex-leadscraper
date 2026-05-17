/**
 * Registry aller API-Provider, die der User unter /settings konfigurieren kann.
 * Erweitern: hier eintragen, dann in der Feature-Code-Stelle via getApiKey(id) lesen.
 */

export interface Provider {
  id: string;
  name: string;
  purpose: string;
  description: string;
  docsUrl: string;
  placeholder: string;
  /** Regex für gültige Key-Form (z.B. um Whitespace/CR-LF früh zu erkennen). */
  keyPattern: RegExp;
  /** Hinweis, falls keyPattern nicht matcht. */
  patternHint: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: "google_places",
    name: "Google Places API",
    purpose: "Lead-Daten von Google Maps (verifiziert)",
    description:
      "Holt Firmenname, Telefon, Adresse, Bewertung und Webseite direkt von Google Business Profiles. Beste Datenqualität, ~3ct pro Lead, 200$ Free-Credit/Monat = ~6000 Leads gratis.",
    docsUrl: "https://console.cloud.google.com/apis/library/places.googleapis.com",
    placeholder: "AIzaSy...",
    keyPattern: /^[A-Za-z0-9_\-]+$/,
    patternHint: "Nur Buchstaben, Zahlen, Unterstrich, Bindestrich. Kein Whitespace.",
  },
  {
    id: "anthropic",
    name: "Anthropic API (Claude)",
    purpose: "KI-Lead-Qualifizierung (Webseiten-Score, Pitch-Vorschläge)",
    description:
      "Optional. Schaltet KI-Features frei: Webseiten-Qualität bewerten (Wix/Jimdo-Detect, Mobile-Friendly, Letztes Update), automatischer Cold-Mail-Entwurf pro Lead, Branchen-spezifische Pitch-Hooks.",
    docsUrl: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-api03-...",
    keyPattern: /^sk-ant-[A-Za-z0-9_\-]+$/,
    patternHint: "Anthropic-Keys beginnen mit 'sk-ant-'.",
  },
  {
    id: "openai",
    name: "OpenAI API",
    purpose: "Alternative KI-Qualifizierung (statt Anthropic)",
    description:
      "Optional. Wird genutzt, falls kein Anthropic-Key gesetzt ist. Gleiche Features wie Anthropic (Webseiten-Score, Mail-Entwurf), aber mit GPT-Modellen.",
    docsUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-proj-...",
    keyPattern: /^sk-[A-Za-z0-9_\-]+$/,
    patternHint: "OpenAI-Keys beginnen mit 'sk-'.",
  },
];

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Maskiert einen Key für die Anzeige: "AIzaSy•••••••••••••••••••dE4f" */
export function maskKey(value: string): string {
  if (value.length <= 10) return "•".repeat(value.length);
  const head = value.slice(0, 6);
  const tail = value.slice(-4);
  return `${head}${"•".repeat(Math.max(8, value.length - 10))}${tail}`;
}
