"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LEAD_STATUS_META,
  type DbLead,
  type LeadStatus,
  type QualifiedInfo,
} from "@/lib/types";

type QualifiedStatus = "follow_up" | "interested" | "call_scheduled" | "won";

const COLUMN_ORDER: QualifiedStatus[] = ["follow_up", "interested", "call_scheduled", "won"];

export default function QualifiedPage() {
  const [leads, setLeads] = useState<DbLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<DbLead | null>(null);

  async function reload() {
    try {
      const r = await fetch("/api/qualified");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as { leads: DbLead[] };
      setLeads(d.leads);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const grouped = useMemo(() => {
    const g: Record<QualifiedStatus, DbLead[]> = {
      follow_up: [],
      interested: [],
      call_scheduled: [],
      won: [],
    };
    for (const l of leads ?? []) {
      const s = (l.leadStatus ?? "new") as LeadStatus;
      if (s === "follow_up" || s === "interested" || s === "call_scheduled" || s === "won") {
        g[s].push(l);
      }
    }
    return g;
  }, [leads]);

  const total = leads?.length ?? 0;

  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="card border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          ❌ {error}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] p-4 lg:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">🔥 Gesettete Leads</h1>
          <p className="mt-1 text-xs text-stone-500 sm:text-sm">
            Hier landest du alle Leads, die ab „Interessiert" hochgesettet sind. Klick öffnet
            das Detail-Sheet mit Ansprechpartner, Bedarf, Demo-Termin etc.
          </p>
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-medium text-stone-500 tabular-nums">
          {total} aktiv
        </span>
      </header>

      {leads === null && <p className="text-stone-500">Lade…</p>}

      {leads && leads.length === 0 && (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <div className="text-5xl">🎯</div>
          <p className="text-sm text-stone-600">
            Noch keine gesetteten Leads. Sobald jemand auf 🔥 / 📅 / 🏆 wandert, taucht er hier auf.
          </p>
        </div>
      )}

      {leads && leads.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {COLUMN_ORDER.map((s) => {
            const meta = LEAD_STATUS_META[s];
            const list = grouped[s];
            return (
              <div key={s} className="flex flex-col rounded-3xl bg-stone-100/70 p-2.5">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: meta.accent }} />
                    <span>{meta.label}</span>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-stone-500 tabular-nums shadow-sm">
                    {list.length}
                  </span>
                </div>
                <div className="flex max-h-[78vh] flex-col gap-2.5 overflow-y-auto p-0.5 pt-1.5">
                  {list.length === 0 && (
                    <p className="px-2 py-8 text-center text-xs text-stone-400">leer</p>
                  )}
                  {list.map((l) => (
                    <QualifiedCard key={l.uid} lead={l} onClick={() => setOpenLead(l)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openLead && (
        <QualifiedDrawer
          lead={openLead}
          onClose={() => setOpenLead(null)}
          onSaved={() => {
            reload();
            setOpenLead(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Karte
// ============================================================================

function QualifiedCard({ lead, onClick }: { lead: DbLead; onClick: () => void }) {
  const q = lead.qualifiedInfo;
  const completeness = qualifiedCompleteness(q);
  const ansprechpartner = q?.ansprechpartner ?? null;
  const next = q?.naechsteSchritte ?? null;
  const accent = LEAD_STATUS_META[lead.leadStatus ?? "new"].accent;

  return (
    <button
      onClick={onClick}
      className="group relative shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-white py-3 pl-4 pr-3 text-left text-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_6px_16px_rgba(0,0,0,0.08)]"
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: accent }} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div className="line-clamp-1 font-semibold text-stone-900">{lead.firmenname}</div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            completeness >= 60
              ? "bg-emerald-50 text-emerald-700"
              : completeness >= 20
              ? "bg-amber-50 text-amber-700"
              : "bg-stone-50 text-stone-500"
          }`}
        >
          {completeness}% Profil
        </span>
      </div>

      {lead.telefon && (
        <div className="mt-1 flex items-center gap-1.5 text-rose-600">
          <span className="text-[11px]">📞</span>
          <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums">
            {lead.telefon}
          </span>
        </div>
      )}

      {ansprechpartner && (
        <div className="mt-1.5 text-xs text-stone-700">
          👤 {ansprechpartner}
          {q?.position && <span className="text-stone-500"> · {q.position}</span>}
        </div>
      )}

      {/* Termin-Chips: erst Demo-Termin, dann Wiedervorlage/Call-Termin */}
      <div className="mt-1 flex flex-wrap gap-1">
        {q?.demoTermin && (
          <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-1.5 py-0.5 text-[11px] font-medium text-purple-700">
            📅 Demo: {new Date(q.demoTermin).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
          </span>
        )}
        {lead.nextActionAt && lead.leadStatus === "follow_up" && (
          <span className="inline-flex items-center gap-1 rounded-md bg-cyan-50 px-1.5 py-0.5 text-[11px] font-medium text-cyan-700">
            🔄 Wiedervorlage: {new Date(lead.nextActionAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
          </span>
        )}
        {lead.nextActionAt && lead.leadStatus === "call_scheduled" && (
          <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-1.5 py-0.5 text-[11px] font-medium text-purple-700">
            📅 Termin: {new Date(lead.nextActionAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
          </span>
        )}
      </div>

      {next && (
        <div className="mt-1.5 line-clamp-2 text-[11px] text-stone-600">
          ⏭ {next}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2 border-t border-stone-100 pt-2 text-[11px] text-stone-500">
        <span className="line-clamp-1 flex-1">{lead.ort} · {lead.dienstleistung}</span>
        {lead.lastContact && (
          <span className="shrink-0 text-stone-400">
            {new Date(lead.lastContact).toLocaleDateString("de-DE")}
          </span>
        )}
        {lead.lastSetterName && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
            style={{ background: lead.lastSetterColor ?? "#525252" }}
            title={`von ${lead.lastSetterName}`}
          />
        )}
      </div>
    </button>
  );
}

// ============================================================================
// Detail-Drawer
// ============================================================================

function QualifiedDrawer({
  lead,
  onClose,
  onSaved,
}: {
  lead: DbLead;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<QualifiedInfo>(() => lead.qualifiedInfo ?? {});
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function setField<K extends keyof QualifiedInfo>(key: K, value: QualifiedInfo[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/leads/${encodeURIComponent(lead.uid)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qualifiedInfo: form, notes }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok || d.error) throw new Error(d.error ?? `HTTP ${r.status}`);
      setMsg({ kind: "ok", text: "Gespeichert" });
      setTimeout(onSaved, 600);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const meta = LEAD_STATUS_META[lead.leadStatus ?? "new"];

  return (
    <div
      className="fixed inset-0 z-[800] flex items-stretch justify-end bg-stone-900/60 p-0 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 p-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full ${meta.color} px-3 py-1 text-xs font-medium text-white`}>
                {meta.emoji} {meta.label}
              </span>
              {lead.kategorie && <span className="pill text-xs">{lead.kategorie}</span>}
              {lead.lastSetterName && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-700 ring-1 ring-stone-200">
                  <span className="h-2 w-2 rounded-full" style={{ background: lead.lastSetterColor ?? "#525252" }} />
                  zuletzt von {lead.lastSetterName}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold tracking-tight">{lead.firmenname}</h2>
            <p className="mt-1 text-xs text-stone-500">
              {lead.adresse} · {lead.dienstleistung}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            ✕
          </button>
        </div>

        {/* Quick-Actions */}
        <div className="flex gap-2 border-b border-stone-100 px-5 py-3">
          {lead.telefon && (
            <a
              href={`tel:${lead.telefon}`}
              className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
            >
              📞 {lead.telefon}
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              ✉️ {lead.email}
            </a>
          )}
          {lead.firmenname && (
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent([lead.firmenname, lead.ort].filter(Boolean).join(" "))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              🅖 Google
            </a>
          )}
          {lead.listId && (
            <Link
              href={`/lists/${lead.listId}?lead=${encodeURIComponent(lead.uid)}`}
              className="ml-auto inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              → In Liste
            </Link>
          )}
        </div>

        {/* Form */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <FormSection title="Kontakt">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Ansprechpartner"
                value={form.ansprechpartner ?? ""}
                onChange={(v) => setField("ansprechpartner", v)}
                placeholder="z.B. Anna Müller"
              />
              <Field
                label="Position"
                value={form.position ?? ""}
                onChange={(v) => setField("position", v)}
                placeholder="z.B. Inhaberin, Marketing-Leitung"
              />
              <label className="col-span-full flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(form.istEntscheider)}
                  onChange={(e) => setField("istEntscheider", e.target.checked)}
                  className="h-4 w-4 accent-rose-600"
                />
                Ist Entscheider
              </label>
              <Field
                label="Beste Erreichbarkeit"
                value={form.erreichbarkeit ?? ""}
                onChange={(v) => setField("erreichbarkeit", v)}
                placeholder="z.B. Mo–Do, 9–12 Uhr"
                className="sm:col-span-full"
              />
            </div>
          </FormSection>

          <FormSection title="Bedarf & Budget">
            <Textarea
              label="Bedarf / Schmerzpunkte"
              value={form.bedarf ?? ""}
              onChange={(v) => setField("bedarf", v)}
              placeholder="Was hat sie gesagt, was sie konkret braucht?"
              rows={3}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Budget-Hinweis"
                value={form.budget ?? ""}
                onChange={(v) => setField("budget", v)}
                placeholder="z.B. 'bis 500€/Monat'"
              />
              <Field
                label="Konkurrenz / aktueller Anbieter"
                value={form.konkurrenz ?? ""}
                onChange={(v) => setField("konkurrenz", v)}
                placeholder="z.B. 'nutzt aktuell XY'"
              />
            </div>
          </FormSection>

          <FormSection title="Nächste Schritte">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label-base">Demo-/Folgetermin</span>
                <input
                  type="datetime-local"
                  value={toDatetimeLocal(form.demoTermin)}
                  onChange={(e) =>
                    setField("demoTermin", e.target.value ? new Date(e.target.value).toISOString() : null)
                  }
                  className="input-base"
                />
              </label>
              <Field
                label="Versendete Unterlagen"
                value={form.unterlagen ?? ""}
                onChange={(v) => setField("unterlagen", v)}
                placeholder="z.B. 'Pitch-Deck 10.6, Angebot 12.6'"
              />
            </div>
            <Textarea
              label="Nächste Schritte"
              value={form.naechsteSchritte ?? ""}
              onChange={(v) => setField("naechsteSchritte", v)}
              placeholder="z.B. 'Am 15.6 Demo geben, Vertrag bis 20.6 zusenden'"
              rows={2}
            />
          </FormSection>

          <FormSection title="Notizen (Gesprächs-Log)">
            <Textarea
              label=""
              value={notes}
              onChange={setNotes}
              placeholder="Freie Notizen zum Lead — Gesprächs-Notizen, Anekdoten, etc."
              rows={4}
            />
          </FormSection>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-stone-100 bg-stone-50 px-5 py-3">
          <div className="text-xs">
            {msg && (
              <span className={msg.kind === "ok" ? "text-emerald-700" : "text-rose-700"}>
                {msg.kind === "ok" ? "✅" : "❌"} {msg.text}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">
              Schließen
            </button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? "Speichere…" : "💾 Speichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label-base">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-base"
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      {label && <span className="label-base">{label}</span>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm placeholder:text-stone-400 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-100"
      />
    </label>
  );
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Vervollständigungs-Score: wie viele der 9 strukturierten Felder gepflegt sind.
 * Reine UX-Heuristik — zeigt auf einer Karte ob das Profil schon Substanz hat.
 */
function qualifiedCompleteness(q: QualifiedInfo | null): number {
  if (!q) return 0;
  const fields: Array<keyof QualifiedInfo> = [
    "ansprechpartner",
    "position",
    "erreichbarkeit",
    "bedarf",
    "budget",
    "konkurrenz",
    "demoTermin",
    "unterlagen",
    "naechsteSchritte",
  ];
  const filled = fields.filter((f) => {
    const v = q[f];
    return typeof v === "string" ? v.trim().length > 0 : Boolean(v);
  }).length;
  return Math.round((filled / fields.length) * 100);
}
