import type { Lead } from "./types";

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
  const key = apiKey ?? process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY fehlt – setze ihn als Env-Var oder wähle OSM.");

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
    places.push(...(data.places ?? []));
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
