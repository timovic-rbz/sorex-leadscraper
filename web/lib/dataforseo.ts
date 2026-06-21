import type { BusinessProfile, Lead } from "./types";
import { getApiKey } from "./api-keys";
import { recordDataForSeoMapsSearch, recordDataForSeoMyBusinessInfo } from "./usage";

// Google-Maps-SERP, synchroner "Live"-Endpoint (kein Polling nötig).
const MAPS_URL = "https://api.dataforseo.com/v3/serp/google/maps/live/advanced";
// Einzelnes Business-Profil mit Detaildaten (Beschreibung, Attribute, is_claimed …).
const MY_BUSINESS_INFO_URL =
  "https://api.dataforseo.com/v3/business_data/google/my_business_info/live";
// location_code für Deutschland (DataForSEO-Standortkatalog).
const LOCATION_CODE_DE = 2276;

interface DfsRating {
  value?: number;
  votes_count?: number;
}

interface DfsTime {
  hour?: number;
  minute?: number;
}

interface DfsWorkHours {
  timetable?: Record<string, { open?: DfsTime; close?: DfsTime }[] | null>;
}

interface DfsMapsItem {
  type?: string;
  title?: string;
  phone?: string;
  address?: string;
  url?: string;
  domain?: string;
  category?: string;
  rating?: DfsRating;
  place_id?: string;
  cid?: string;
  feature_id?: string;
  work_hours?: DfsWorkHours;
}

interface DfsTask {
  status_code?: number;
  status_message?: string;
  result?: { items?: DfsMapsItem[] }[] | null;
}

interface DfsResponse {
  status_code?: number;
  status_message?: string;
  tasks?: DfsTask[];
}

/**
 * Lead-Suche über DataForSEO (Google-Maps-SERP). Spiegelt das Verhalten von
 * searchGoogle: "Dienstleistung in Ort" → Liste von Firmen-Leads.
 *
 * Auth läuft über Basic-Auth mit "login:passwort". Die Credentials liegen unter
 * Einstellungen (Provider `dataforseo`) oder als Env-Var – siehe credentials().
 */
export async function searchDataForSeo(
  service: string,
  city: string,
  maxResults = 20,
  creds?: string,
): Promise<Lead[]> {
  const cred = (creds ?? (await credentials()) ?? "").trim();
  if (!cred.includes(":")) {
    throw new Error(
      "Keine DataForSEO-Credentials konfiguriert. Unter Einstellungen im Format login:passwort " +
        "hinterlegen (oder DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD setzen).",
    );
  }
  const auth = Buffer.from(cred).toString("base64");
  const depth = Math.min(100, Math.max(1, maxResults));

  const r = await fetch(MAPS_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        keyword: `${service} ${city}`,
        language_code: "de",
        location_code: LOCATION_CODE_DE,
        depth,
      },
    ]),
  });

  if (!r.ok) {
    // 401 = falsche Credentials, 402 = kein Guthaben – Text durchreichen.
    throw new Error(`DataForSEO ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }

  const data = (await r.json()) as DfsResponse;
  const task = data.tasks?.[0];
  // DataForSEO antwortet mit HTTP 200 auch bei Task-Fehlern; Status steckt im Body.
  if (!task || task.status_code !== 20000) {
    const msg = task?.status_message ?? data.status_message ?? "unbekannter Fehler";
    throw new Error(`DataForSEO: ${msg}`);
  }

  const items = (task.result?.[0]?.items ?? []).filter((i) => i.type === "maps_search");
  // Verbrauch protokollieren – ein Live-Advanced-Call kostet pauschal, egal wie
  // viele Treffer; wir loggen die Trefferzahl als units fürs Dashboard.
  void recordDataForSeoMapsSearch(items.length);

  return items.slice(0, maxResults).map((i) => itemToLead(i, service, city));
}

/** Credentials aus DB (Settings) oder Env-Var. */
async function credentials(): Promise<string | null> {
  const stored = await getApiKey("dataforseo");
  if (stored) return stored;
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (login && password) return `${login}:${password}`;
  return null;
}

function itemToLead(i: DfsMapsItem, service: string, city: string): Lead {
  const id = i.place_id ?? i.cid ?? i.feature_id ?? `${i.title ?? "?"}-${i.address ?? ""}`;
  return {
    uid: `dataforseo:${id}`,
    source: "dataforseo",
    firmenname: i.title ?? "",
    telefon: i.phone ?? "",
    adresse: i.address ?? "",
    webseite: i.url ?? "",
    email: "",
    bewertung: i.rating?.value != null ? String(i.rating.value) : "",
    anzahlReviews: i.rating?.votes_count ?? 0,
    googleMaps: i.cid ? `https://www.google.com/maps?cid=${i.cid}` : "",
    oeffnungszeiten: formatWorkHours(i.work_hours),
    kategorie: i.category ?? "",
    status: "",
    ort: city,
    dienstleistung: service,
  };
}

const DAY_MAP: [string, string][] = [
  ["monday", "Montag"],
  ["tuesday", "Dienstag"],
  ["wednesday", "Mittwoch"],
  ["thursday", "Donnerstag"],
  ["friday", "Freitag"],
  ["saturday", "Samstag"],
  ["sunday", "Sonntag"],
];

/**
 * Wandelt DataForSEOs work_hours.timetable in das gleiche Pipe-Format um, das
 * auch Google Places liefert ("Montag: 09:00–17:00 | Dienstag: …"), damit der
 * "jetzt geöffnet"-Parser auf den Lead-Karten direkt funktioniert.
 */
function formatWorkHours(wh: DfsWorkHours | undefined): string {
  const tt = wh?.timetable;
  if (!tt) return "";
  const parts: string[] = [];
  for (const [en, de] of DAY_MAP) {
    const ranges = tt[en];
    if (ranges === undefined) continue;
    if (ranges === null) {
      parts.push(`${de}: geschlossen`);
      continue;
    }
    const formatted = ranges
      .filter((r) => r.open && r.close)
      .map((r) => `${hhmm(r.open)}–${hhmm(r.close)}`)
      .join(", ");
    parts.push(`${de}: ${formatted || "geschlossen"}`);
  }
  return parts.join(" | ");
}

function hhmm(t: DfsTime | undefined): string {
  const h = String(t?.hour ?? 0).padStart(2, "0");
  const m = String(t?.minute ?? 0).padStart(2, "0");
  return `${h}:${m}`;
}

// =============================================================================
// BUSINESS-PROFIL – Detaildaten eines einzelnen Profils (on-demand im Lead-Modal)
// =============================================================================

interface DfsBizItem {
  title?: string;
  description?: string;
  category?: string;
  additional_categories?: string[] | null;
  is_claimed?: boolean | null;
  total_photos?: number | null;
  price_level?: string | null;
  main_image?: string | null;
  book_online_url?: string | null;
  contact_url?: string | null;
  rating?: DfsRating;
  rating_distribution?: Record<string, number> | null;
  attributes?: {
    available_attributes?: Record<string, string[]> | null;
    unavailable_attributes?: Record<string, string[]> | null;
  } | null;
  place_topics?:
    | Record<string, number>
    | { topic?: string; keyword?: string; count?: number }[]
    | null;
}

interface DfsBizResponse {
  status_code?: number;
  status_message?: string;
  tasks?: {
    status_code?: number;
    status_message?: string;
    result?: { items?: DfsBizItem[] }[] | null;
  }[];
}

/**
 * Lädt das volle Google-Business-Profil über DataForSEO. Trifft das Profil
 * gezielt per `cid:`/`place_id:` (eindeutig) und fällt sonst auf Name+Adresse
 * zurück. Liefert null, wenn DataForSEO kein Profil findet.
 */
export async function getBusinessProfile(
  params: { cid?: string; placeId?: string; name?: string; address?: string; ort?: string },
  creds?: string,
): Promise<BusinessProfile | null> {
  const cred = (creds ?? (await credentials()) ?? "").trim();
  if (!cred.includes(":")) {
    throw new Error(
      "Keine DataForSEO-Credentials konfiguriert. Unter Einstellungen im Format login:passwort hinterlegen.",
    );
  }
  const auth = Buffer.from(cred).toString("base64");

  const keyword = params.cid
    ? `cid:${params.cid}`
    : params.placeId
      ? `place_id:${params.placeId}`
      : [params.name, params.address || params.ort].filter(Boolean).join(", ");
  if (!keyword) {
    throw new Error("Kein Identifikator (cid/place_id/Name) für das Profil übergeben.");
  }

  const r = await fetch(MY_BUSINESS_INFO_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{ keyword, language_code: "de", location_code: LOCATION_CODE_DE }]),
  });

  if (!r.ok) {
    throw new Error(`DataForSEO ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }

  const data = (await r.json()) as DfsBizResponse;
  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    const msg = task?.status_message ?? data.status_message ?? "unbekannter Fehler";
    throw new Error(`DataForSEO: ${msg}`);
  }

  void recordDataForSeoMyBusinessInfo();
  const item = task.result?.[0]?.items?.[0];
  if (!item) return null;
  return itemToProfile(item);
}

function itemToProfile(i: DfsBizItem): BusinessProfile {
  return {
    isClaimed: typeof i.is_claimed === "boolean" ? i.is_claimed : null,
    description: i.description ?? "",
    category: i.category ?? "",
    additionalCategories: (i.additional_categories ?? []).filter(Boolean),
    attributes: flattenAttributes(i.attributes),
    placeTopics: normalizeTopics(i.place_topics),
    ratingValue: i.rating?.value ?? null,
    ratingVotes: i.rating?.votes_count ?? null,
    ratingDistribution: i.rating_distribution ?? null,
    totalPhotos: i.total_photos ?? null,
    priceLevel: i.price_level ?? "",
    bookOnlineUrl: i.book_online_url ?? "",
    contactUrl: i.contact_url ?? "",
    mainImage: i.main_image ?? "",
  };
}

/** available_attributes ist nach Kategorie gruppiert – wir flachen alle Werte aus. */
function flattenAttributes(a: DfsBizItem["attributes"]): string[] {
  const av = a?.available_attributes;
  if (!av) return [];
  return Object.values(av)
    .flat()
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

/** place_topics kommt mal als Objekt {Thema: count}, mal als Array – normalisieren. */
function normalizeTopics(pt: DfsBizItem["place_topics"]): { topic: string; count: number }[] {
  if (!pt) return [];
  const list = Array.isArray(pt)
    ? pt.map((t) => ({ topic: String(t.topic ?? t.keyword ?? ""), count: Number(t.count ?? 0) }))
    : Object.entries(pt).map(([topic, count]) => ({ topic, count: Number(count) || 0 }));
  return list
    .filter((t) => t.topic)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}
