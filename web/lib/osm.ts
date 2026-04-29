import type { Lead } from "./types";
import { matchCategory } from "./osm-categories";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "soreleads-scraper/1.0 (https://github.com/local-lead-tool)";

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function geocodeCity(city: string): Promise<[number, number, number, number] | null> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(city)}&format=json&limit=1&countrycodes=de`;
  const r = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const data = (await r.json()) as Array<{ boundingbox: [string, string, string, string] }>;
  if (data.length === 0) return null;
  const [s, n, w, e] = data[0].boundingbox.map(Number);
  return [s, w, n, e];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function searchOsm(
  service: string,
  city: string,
  maxResults = 30,
): Promise<Lead[]> {
  const bbox = await geocodeCity(city);
  if (!bbox) throw new Error(`Stadt '${city}' nicht gefunden (Nominatim).`);
  const [south, west, north, east] = bbox;
  const bboxStr = `${south},${west},${north},${east}`;

  // Mapping DE-Begriff → OSM-Tags (z.B. "Nagelstudio" → shop=beauty + name~"nagel|nail")
  const mapping = matchCategory(service);

  // Name-basierte Suche: Original-Begriff + alternative Schreibweisen
  const namePatterns = [escapeRegex(service), ...(mapping.nameAlt ?? []).map(escapeRegex)];
  const nameRegex = [...new Set(namePatterns)].join("|");

  const queryParts: string[] = [`nwr["name"~"${nameRegex}",i](${bboxStr});`];

  // Exakte Tag-Matches aus Mapping
  for (const [tag, value] of mapping.tags ?? []) {
    queryParts.push(`nwr["${tag}"="${value}"](${bboxStr});`);
  }

  // Wenn kein Mapping greift: Fallback auf alte Such-über-alle-Tag-Werte-Logik
  if (!mapping.tags || mapping.tags.length === 0) {
    const safe = escapeRegex(service);
    queryParts.push(
      `nwr["shop"~"${safe}",i](${bboxStr});`,
      `nwr["amenity"~"${safe}",i](${bboxStr});`,
      `nwr["office"~"${safe}",i](${bboxStr});`,
      `nwr["craft"~"${safe}",i](${bboxStr});`,
      `nwr["healthcare"~"${safe}",i](${bboxStr});`,
    );
  }

  const query = `
[out:json][timeout:30];
(
${queryParts.map((p) => "  " + p).join("\n")}
);
out center tags ${maxResults * 5};
`;

  const r = await fetch(OVERPASS_URL, {
    method: "POST",
    body: new URLSearchParams({ data: query }),
    headers: { "User-Agent": USER_AGENT },
  });
  if (!r.ok) throw new Error(`Overpass ${r.status}: ${(await r.text()).slice(0, 200)}`);

  const json = (await r.json()) as { elements?: OverpassElement[] };
  const elements = json.elements ?? [];

  const seen = new Set<string>();
  const leads: Lead[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = (tags.name ?? "").trim();
    if (!name) continue;
    const key = `${name.toLowerCase()}|${tags["addr:street"] ?? ""}|${tags["addr:housenumber"] ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    leads.push(elementToLead(el, service, city));
    if (leads.length >= maxResults) break;
  }
  return leads;
}

function elementToLead(el: OverpassElement, dl: string, ort: string): Lead {
  const tags = el.tags ?? {};
  const street = tags["addr:street"]
    ? tags["addr:street"] + (tags["addr:housenumber"] ? ` ${tags["addr:housenumber"]}` : "")
    : "";
  const locality = `${tags["addr:postcode"] ?? ""} ${tags["addr:city"] ?? ""}`.trim();
  const adresse = [street, locality].filter(Boolean).join(", ");
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const googleMaps = lat && lon ? `https://www.google.com/maps?q=${lat},${lon}` : "";
  const kategorie =
    tags.shop || tags.amenity || tags.office || tags.craft || tags.healthcare || "";

  return {
    uid: `osm:${el.type}/${el.id}`,
    source: "osm",
    firmenname: tags.name ?? "",
    telefon: tags.phone ?? tags["contact:phone"] ?? "",
    adresse,
    webseite: tags.website ?? tags["contact:website"] ?? "",
    email: tags.email ?? tags["contact:email"] ?? "",
    bewertung: "",
    anzahlReviews: 0,
    googleMaps,
    oeffnungszeiten: tags.opening_hours ?? "",
    kategorie,
    status: "OPERATIONAL",
    ort,
    dienstleistung: dl,
  };
}
