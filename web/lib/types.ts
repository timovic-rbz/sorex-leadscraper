export type Source = "osm" | "google";

export type LeadStatus =
  | "new"
  | "no_answer"
  | "not_interested"
  | "interested"
  | "call_scheduled"
  | "won"
  | "lost";

export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "new",
  "no_answer",
  "interested",
  "call_scheduled",
  "won",
  "not_interested",
  "lost",
];

export const LEAD_STATUS_META: Record<LeadStatus, { label: string; emoji: string; color: string }> = {
  new:             { label: "Neu",              emoji: "🆕", color: "bg-blue-600" },
  no_answer:       { label: "Nicht erreicht",   emoji: "📵", color: "bg-yellow-600" },
  interested:      { label: "Interessiert",     emoji: "🔥", color: "bg-orange-600" },
  call_scheduled:  { label: "Call vereinbart",  emoji: "📅", color: "bg-purple-600" },
  won:             { label: "Kunde",            emoji: "🏆", color: "bg-green-600" },
  not_interested:  { label: "Kein Interesse",   emoji: "❌", color: "bg-neutral-700" },
  lost:            { label: "Verloren",         emoji: "🪦", color: "bg-neutral-700" },
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

export interface List {
  id: number;
  name: string;
  createdAt: string;
}

export interface ListWithStats extends List {
  total: number;
  byStatus: Record<LeadStatus, number>;
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
