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
 * Website-Qualitäts-Check über DataForSEO (OnPage Instant Pages + Lighthouse).
 * Beantwortet: gibt es eine Website, wie gut ist sie technisch/SEO-seitig
 * optimiert. Felder sind null, wenn die jeweilige Analyse fehlschlug.
 */
export interface WebsiteCheck {
  url: string;
  /** OnPage-Optimierungs-Score (0–100). */
  onpageScore: number | null;
  /** Ladezeit in Millisekunden. */
  loadTimeMs: number | null;
  isHttps: boolean;
  hasTitle: boolean | null;
  hasDescription: boolean | null;
  hasH1: boolean | null;
  imagesHaveAlt: boolean | null;
  wordCount: number | null;
  /** Menschenlesbare Mängelliste (aus den OnPage-Checks abgeleitet). */
  issues: string[];
  onpageError: string | null;
  /** Lighthouse-Scores, je 0–100. */
  lhPerformance: number | null;
  lhSeo: number | null;
  lhBestPractices: number | null;
  lhAccessibility: number | null;
  lighthouseError: string | null;
}

/** Google-Ranking + Marktdaten zum Hauptkeyword (Dienstleistung + Ort) eines Leads. */
export interface MarketCheck {
  /** Geprüftes Keyword, z.B. "nagelstudio langenfeld". */
  keyword: string;
  /** Durchschnittliches monatliches Suchvolumen (null = unbekannt). */
  searchVolume: number | null;
  /** Wettbewerb laut Google Ads: HIGH / MEDIUM / LOW (oder ""). */
  competition: string;
  /** Klickpreis in EUR (Indikator, wie umkämpft die Branche ist). */
  cpc: number | null;
  /** Eigene organische Position (rank_absolute) oder null = nicht in den Top N. */
  rank: number | null;
  /** Wie tief im SERP gesucht wurde (z.B. 20). */
  rankDepth: number;
  /** Top-Konkurrenten, die über dem Lead stehen. */
  topCompetitors: { rank: number; domain: string; title: string }[];
}

/** Eine einzelne Google-Bewertung (für negative Gesprächsaufhänger). */
export interface ReviewItem {
  rating: number | null;
  text: string;
  timeAgo: string;
  author: string;
}

/** Suchvolumen-Ergebnis für ein frei recherchiertes Keyword/eine Dienstleistung. */
export interface KeywordVolume {
  keyword: string;
  searchVolume: number | null;
  competition: string;
  cpc: number | null;
}

/** Ein Keyword, für das die Website bei Google rankt. */
export interface RankedKeyword {
  keyword: string;
  /** Organische Position. */
  position: number;
  /** Monatliches Suchvolumen (null = unbekannt). */
  searchVolume: number | null;
}

/** Ein Mitbewerber aus dem lokalen Google-Maps-Umfeld. */
export interface Competitor {
  name: string;
  rating: number | null;
  reviews: number;
  hasWebsite: boolean;
  /** Ist das der Lead selbst (Namensmatch)? */
  isSelf: boolean;
}

/** Konkurrenz-Vergleich: wo steht der Lead im lokalen Wettbewerb. */
export interface CompetitorCheck {
  keyword: string;
  /** Gefundene Anbieter im Umkreis. */
  total: number;
  /** Durchschnittsbewertung des Felds. */
  avgRating: number | null;
  /** Wie viele der Anbieter eine Website haben. */
  withWebsite: number;
  /** Platz des Leads nach Bewertung (1 = bester), null wenn nicht gefunden. */
  selfRank: number | null;
  /** Anbieter, nach Bewertung sortiert (inkl. Lead selbst, markiert). */
  competitors: Competitor[];
}

/**
 * In der DB gecachte DataForSEO-Anreicherung eines Leads. Wird pro Lead nur
 * einmal bezahlt – erneutes Öffnen liest aus dem Cache.
 */
export interface LeadEnrichment {
  website?: WebsiteCheck;
  /** ISO-Zeitpunkt, wann der Website-Check lief. */
  websiteAt?: string;
  market?: MarketCheck;
  marketAt?: string;
  reviews?: ReviewItem[];
  reviewsAt?: string;
  competitors?: CompetitorCheck;
  competitorsAt?: string;
  rankedKeywords?: RankedKeyword[];
  rankedKeywordsAt?: string;
  keywordVolumes?: KeywordVolume[];
  keywordVolumesAt?: string;
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
  /** Cal.com-Buchungsreferenz, gesetzt bei echter Terminbuchung (siehe lib/calcom.ts). */
  calBookingUid?: string | null;
  calBookingUrl?: string | null;
  calBookedAt?: string | null;
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
  /** Bei "won": Zeitpunkt der Kündigung (null = aktiver Kunde). Steuert die wiederkehrende Setting-Fee. */
  customerChurnedAt: string | null;
}

export interface Setter {
  id: number;
  name: string;
  color: string;
  isAdmin: boolean;
  /** Setting-Fee: $/Monat, wiederkehrend pro aktivem Kunden, den der Setter gesettet hat. */
  settingFee: number;
  /** Closing-Fee: $ einmalig pro Kunde, den der Setter geclosed hat. */
  closingFee: number;
  createdAt: string;
}

/**
 * Provisions-Übersicht eines Setters. Zweistufiges Modell:
 *  - Setting-Fee: wiederkehrend pro Monat × aktive Kunden (gesettet, nicht gekündigt)
 *  - Closing-Fee: einmalig pro geclostem Kunde
 */
export interface CommissionSummary {
  setterId: number;
  name: string;
  color: string;
  /** $/Monat pro aktivem Kunden. */
  settingFee: number;
  /** $ einmalig pro Closing. */
  closingFee: number;
  /** Aktive Kunden, die dieser Setter gesettet hat (won, nicht gekündigt). */
  activeCustomers: number;
  /** Wiederkehrend diesen Monat: activeCustomers × settingFee. */
  recurringMonth: number;
  /** Closings im laufenden Kalendermonat. */
  closedMonth: number;
  /** Closings insgesamt. */
  closedTotal: number;
  /** Closing-Auszahlung diesen Monat: closedMonth × closingFee. */
  closingMonth: number;
  /** Gesamt-Auszahlung diesen Monat: recurringMonth + closingMonth. */
  monthTotal: number;
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
