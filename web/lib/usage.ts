/**
 * Verbrauchs-Tracking pro externen API-Call. Wird in den jeweiligen Provider-
 * Modulen (z.B. google-places.ts) aufgerufen — Fehler hier dürfen den Haupt-
 * Flow nicht crashen, deshalb dbRecordUsage selbst fängt schon ab.
 *
 * Preise sind grobe Listenpreise zum Zeitpunkt der Implementierung. EUR-Beträge
 * sind aus USD umgerechnet (Faktor 0.92). Kannst du jederzeit hier anpassen,
 * gilt dann für alle NEUEN Calls — alte DB-Einträge bleiben mit dem damals
 * gespeicherten Preis stehen.
 */
import { dbRecordUsage } from "./db";

const USD_TO_EUR = 0.92;

// Google Places "Text Search (New)" — $32 pro 1000 Calls, ein Call = bis zu 20 Places
const GOOGLE_TEXT_SEARCH_USD = 0.032;

// Google Places "Place Details (New)" — wird hier aktuell NICHT genutzt, nur als Referenz
// const GOOGLE_PLACE_DETAILS_USD = 0.017;

// DataForSEO "Google Maps SERP – Live Advanced" — ~$0.002 pro Request (bis 100 Treffer)
const DATAFORSEO_MAPS_USD = 0.002;

// Anthropic Claude (Sonnet 4.5) — Input/Output in USD pro 1M Tokens
const ANTHROPIC_INPUT_USD_PER_MTOK = 3.0;
const ANTHROPIC_OUTPUT_USD_PER_MTOK = 15.0;

// OpenAI GPT-4.1 mini — Input/Output in USD pro 1M Tokens
const OPENAI_INPUT_USD_PER_MTOK = 0.4;
const OPENAI_OUTPUT_USD_PER_MTOK = 1.6;

export async function recordGooglePlacesTextSearch(placesReturned: number): Promise<void> {
  await dbRecordUsage(
    "google_places",
    "text_search",
    placesReturned,
    GOOGLE_TEXT_SEARCH_USD * USD_TO_EUR,
  );
}

export async function recordDataForSeoMapsSearch(itemsReturned: number): Promise<void> {
  await dbRecordUsage(
    "dataforseo",
    "maps_search",
    itemsReturned,
    DATAFORSEO_MAPS_USD * USD_TO_EUR,
  );
}

export async function recordAnthropicCall(inputTokens: number, outputTokens: number): Promise<void> {
  const costUsd =
    (inputTokens * ANTHROPIC_INPUT_USD_PER_MTOK +
      outputTokens * ANTHROPIC_OUTPUT_USD_PER_MTOK) /
    1_000_000;
  await dbRecordUsage("anthropic", "chat", inputTokens + outputTokens, costUsd * USD_TO_EUR);
}

export async function recordOpenAICall(inputTokens: number, outputTokens: number): Promise<void> {
  const costUsd =
    (inputTokens * OPENAI_INPUT_USD_PER_MTOK + outputTokens * OPENAI_OUTPUT_USD_PER_MTOK) /
    1_000_000;
  await dbRecordUsage("openai", "chat", inputTokens + outputTokens, costUsd * USD_TO_EUR);
}

/**
 * Verbraucherfreundliche Labels für die UI.
 */
export const PROVIDER_LABELS: Record<string, { name: string; unit: string; icon: string }> = {
  google_places: { name: "Google Places", unit: "Adressen", icon: "🗺️" },
  dataforseo: { name: "DataForSEO", unit: "Maps-Treffer", icon: "🔎" },
  anthropic: { name: "Anthropic (Claude)", unit: "Tokens", icon: "🤖" },
  openai: { name: "OpenAI (GPT)", unit: "Tokens", icon: "💬" },
};
