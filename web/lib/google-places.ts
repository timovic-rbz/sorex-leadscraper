import type { Lead } from "./types";
import { getApiKey } from "./api-keys";
import { recordGooglePlacesTextSearch } from "./usage";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.regularOpeningHours",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "nextPageToken",
].join(",");

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  primaryTypeDisplayName?: { text?: string };
  businessStatus?: string;
}

export async function searchGoogle(
  service: string,
  city: string,
  maxResults = 20,
  apiKey?: string,
): Promise<Lead[]> {
  // Reihenfolge: explizit übergebener Key → DB (Settings-Page) → Env-Var.
  // Trim wegen Copy-Paste-Artefakten (CR/LF), sonst wirft fetch "The string did not match...".
  const key = (apiKey ?? (await getApiKey("google_places")) ?? "").trim();
  if (!key) {
    throw new Error(
      "Kein Google-Places-Key konfiguriert. Setze ihn unter Einstellungen oder als GOOGLE_API_KEY.",
    );
  }
  if (!/^[A-Za-z0-9_\-]+$/.test(key)) {
    throw new Error(
      "Google-Places-Key enthält ungültige Zeichen (Zeilenumbruch, Leerzeichen o.ä.). " +
        "Unter Einstellungen sauber neu einfügen.",
    );
  }

  const places: GooglePlace[] = [];
  let pageToken: string | undefined;

  while (places.length < maxResults) {
    const body: Record<string, unknown> = {
      textQuery: `${service} in ${city}`,
      languageCode: "de",
      regionCode: "DE",
      pageSize: Math.min(20, maxResults - places.length),
    };
    if (pageToken) body.pageToken = pageToken;

    const r = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELDS,
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      throw new Error(`Google Places ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }

    const data = (await r.json()) as { places?: GooglePlace[]; nextPageToken?: string };
    const batch = data.places ?? [];
    places.push(...batch);
    // Verbrauch protokollieren — Google rechnet PRO Call ab, egal wieviele Places drin sind.
    // Wir loggen trotzdem die Anzahl Adressen als "units", damit man im Dashboard
    // sieht "X Places geholt für Y Cent".
    void recordGooglePlacesTextSearch(batch.length);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
    await new Promise((res) => setTimeout(res, 2000)); // Token braucht ~2s bis er aktiv wird
  }

  const active = places
    .slice(0, maxResults)
    .filter((p) => (p.businessStatus ?? "OPERATIONAL") === "OPERATIONAL");

  return active.map((p) => placeToLead(p, service, city));
}

function placeToLead(p: GooglePlace, dl: string, ort: string): Lead {
  return {
    uid: `google:${p.id}`,
    source: "google",
    firmenname: p.displayName?.text ?? "",
    telefon: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? "",
    adresse: p.formattedAddress ?? "",
    webseite: p.websiteUri ?? "",
    email: "",
    bewertung: p.rating ? String(p.rating) : "",
    anzahlReviews: p.userRatingCount ?? 0,
    googleMaps: p.googleMapsUri ?? "",
    oeffnungszeiten: (p.regularOpeningHours?.weekdayDescriptions ?? []).join(" | "),
    kategorie: p.primaryTypeDisplayName?.text ?? "",
    status: p.businessStatus ?? "",
    ort,
    dienstleistung: dl,
  };
}
