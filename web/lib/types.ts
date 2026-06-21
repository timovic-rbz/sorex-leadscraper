export type Source = "osm" | "google" | "dataforseo";

export type LeadStatus =
  | "new"
  | "no_answer"
  | "follow_up"
  | "not_interested"
  | "interested"
  | "call_scheduled"
  | "won"
  | "lost";

export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "new",
  "no_answer",
  "follow_up",
  "interested",
  "call_scheduled",
  "won",
  "not_interested",
  "lost",
];

export const LEAD_STATUS_META: Record<
  LeadStatus,
  { label: string; emoji: string; color: string; accent: string }
> = {
  new:             { label: "Neu",              emoji: "🆕", color: "bg-blue-600",    accent: "#3b82f6" },
  no_answer:       { label: "Nicht erreicht",   emoji: "📵", color: "bg-yellow-600",  accent: "#eab308" },
  follow_up:       { label: "Wiedervorlage",    emoji: "🔄", color: "bg-cyan-600",    accent: "#06b6d4" },
  interested:      { label: "Interessiert",     emoji: "🔥", color: "bg-orange-600",  accent: "#f97316" },
  call_scheduled:  { label: "Call vereinbart",  emoji: "📅", color: "bg-purple-600",  accent: "#8b5cf6" },
  won:             { label: "Kunde",            emoji: "🏆", color: "bg-green-600",   accent: "#22c55e" },
  not_interested:  { label: "Kein Interesse",   emoji: "❌", color: "bg-neutral-700", accent: "#404040" },
  lost:            { label: "Verloren",         emoji: "🪦", color: "bg-neutral-700", accent: "#94a3b8" },
};

export interface Lead {
  uid: string;
  source: Source;
  firmenname: string;
  telefon: string;
  adresse: string;
  webseite: string;
  email: string;
  bewertung: string;
  anzahlReviews: number;
  googleMaps: string;
  oeffnungszeiten: string;
  kategorie: string;
  status: string;
  ort: string;
  dienstleistung: string;
}

export interface LeadWithDbStatus extends Lead {
  dbStatus: "neu" | "bekannt";
}

/**
 * Erweiterte Google-Business-Profil-Daten, die on-demand über DataForSEO
 * (Business Data "My Business Info") nachgeladen werden – mehr als die
 * Trefferliste liefert.
 */
export interface BusinessProfile {
  /** Ob das Google-Profil vom Inhaber beansprucht wurde (null = unbekannt). */
  isClaimed: boolean | null;
  description: string;
  category: string;
  additionalCategories: string[];
  /** Ausgestattete Merkmale (z.B. "Rollstuhlgerecht", "WLAN", "Termin nötig"). */
  attributes: string[];
  /** Häufige Themen aus Bewertungen. */
  placeTopics: { topic: string; count: number }[];
  ratingValue: number | null;
  ratingVotes: number | null;
  /** Anzahl Bewertungen je Sternzahl ("1".."5"). */
  ratingDistribution: Record<string, number> | null;
  totalPhotos: number | null;
  priceLevel: string;
  bookOnlineUrl: string;
  contactUrl: string;
  mainImage: string;
}

export interface List {
  id: number;
  name: string;
  createdAt: string;
}

export interface ListWithStats extends List {
  total: number;
  called: number;
  touched: number;
  byStatus: Record<LeadStatus, number>;
}

export interface QualifiedInfo {
  ansprechpartner?: string;
  position?: string;
  istEntscheider?: boolean;
  erreichbarkeit?: string;
  bedarf?: string;
  budget?: string;
  konkurrenz?: string;
  demoTermin?: string | null;
  unterlagen?: string;
  naechsteSchritte?: string;
}

export interface DbLeadCrm {
  leadStatus: LeadStatus;
  notes: string;
  lastContact: string | null;
  callCount: number;
  nextActionAt: string | null;
  listId: number | null;
  firstSeen: string;
  lastSeen: string;
  lastSetterId: number | null;
  lastSetterName: string | null;
  lastSetterColor: string | null;
  qualifiedInfo: QualifiedInfo | null;
}

export interface Setter {
  id: number;
  name: string;
  color: string;
  isAdmin: boolean;
  /** Provision, die der Setter pro Abschluss (Lead → "Kunde") bekommt, in Euro. */
  commissionEur: number;
  createdAt: string;
}

/** Provisions-Übersicht eines Setters (abgeleitet aus den won-Events). */
export interface CommissionSummary {
  setterId: number;
  name: string;
  color: string;
  /** Provision pro Abschluss (€). */
  rateEur: number;
  /** Abschlüsse im laufenden Kalendermonat. */
  wonMonth: number;
  /** Abschlüsse insgesamt (all-time). */
  wonTotal: number;
  /** rateEur × wonMonth. */
  monthEur: number;
  /** rateEur × wonTotal. */
  totalEur: number;
}

export interface SessionInfo {
  setterId: number | null;
  setterName: string | null;
  setterColor: string | null;
  isAdmin: boolean;
}

export interface LeaderboardRow {
  setterId: number;
  name: string;
  color: string;
  interested: number;
  callScheduled: number;
  won: number;
  totalSet: number;
  totalCalls: number;
}

export type DbLead = Lead & DbLeadCrm;

export interface SearchRequest {
  ort: string;
  dienstleistung: string;
  source: Source;
  maxResults: number;
  scrapeEmails: boolean;
}

export interface SearchResponse {
  leads: Lead[];
  totalFound: number;
  withPhone: number;
  withWebsite: number;
  withEmail: number;
}
