import { dbGetApiKey } from "./db";

/**
 * Holt einen API-Key. Priorität:
 *   1. DB (vom User unter /settings gesetzt)
 *   2. Env-Var (fallback, z.B. GOOGLE_API_KEY für lokale Entwicklung)
 *
 * Trimmt das Ergebnis, weil Copy-Paste oft CR/LF anhängt.
 */
export async function getApiKey(provider: string): Promise<string | null> {
  try {
    const fromDb = await dbGetApiKey(provider);
    if (fromDb) return fromDb.trim();
  } catch {
    // DB nicht verfügbar (z.B. lokale Entwicklung ohne DATABASE_URL) → Env-Fallback
  }

  const envName = provider.toUpperCase() + "_API_KEY";
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv.trim();

  // Spezialfall: Google Places hat historisch GOOGLE_API_KEY (ohne "_PLACES")
  if (provider === "google_places" && process.env.GOOGLE_API_KEY) {
    return process.env.GOOGLE_API_KEY.trim();
  }

  return null;
}
