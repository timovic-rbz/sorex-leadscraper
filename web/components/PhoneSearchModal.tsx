"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface LookupRow {
  uid: string;
  firmenname: string;
  telefon: string;
  adresse: string;
  ort: string;
  dienstleistung: string;
  leadStatus: string;
  callCount: number;
  lastContact: string | null;
  listId: number | null;
  listName: string | null;
  lastSetterName: string | null;
  lastSetterColor: string | null;
}

const STATUS_META: Record<string, { label: string; emoji: string; color: string }> = {
  new: { label: "Neu", emoji: "🆕", color: "bg-blue-600" },
  no_answer: { label: "Nicht erreicht", emoji: "📵", color: "bg-yellow-600" },
  interested: { label: "Interessiert", emoji: "🔥", color: "bg-orange-600" },
  call_scheduled: { label: "Call vereinbart", emoji: "📅", color: "bg-purple-600" },
  won: { label: "Kunde", emoji: "🏆", color: "bg-green-600" },
  not_interested: { label: "Kein Interesse", emoji: "❌", color: "bg-neutral-700" },
  lost: { label: "Verloren", emoji: "🪦", color: "bg-neutral-700" },
};

export function PhoneSearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LookupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Beim Öffnen Fokus + leere State
  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // Debounced Lookup
  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    const t = setTimeout(() => {
      fetch(`/api/leads/lookup?q=${encodeURIComponent(q)}`)
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((d: { leads: LookupRow[] }) => {
          if (alive) setResults(d.leads);
        })
        .catch((e) => {
          if (alive) setError((e as Error).message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open]);

  // ESC schließt
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center bg-stone-900/50 p-4 pt-16 backdrop-blur-sm sm:pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Such-Input */}
        <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-3">
          <span className="text-xl">📞</span>
          <input
            ref={inputRef}
            type="search"
            inputMode="tel"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Telefonnummer oder Firmenname suchen…"
            className="flex-1 bg-transparent text-base outline-none placeholder:text-stone-400"
            autoComplete="off"
          />
          {loading && (
            <span className="animate-spin text-sm text-stone-400" aria-hidden>
              ⏳
            </span>
          )}
          <kbd className="hidden rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] text-stone-500 sm:inline-block">
            Esc
          </kbd>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="m-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
              ❌ {error}
            </div>
          )}

          {!error && q.trim().length < 3 && (
            <div className="p-8 text-center text-sm text-stone-500">
              <p className="mb-2 text-2xl">🔎</p>
              <p>Gib mindestens 3 Zeichen ein.</p>
              <p className="mt-2 text-xs text-stone-400">
                Tipp: Bei einem Rückruf reichen die letzten 4–6 Ziffern.
                <br />
                Format egal: +49 212 1234, 0212 1234 oder nur 1234 funktionieren.
              </p>
            </div>
          )}

          {!error && q.trim().length >= 3 && !loading && results.length === 0 && (
            <div className="p-8 text-center text-sm text-stone-500">
              <p className="mb-2 text-2xl">🤷</p>
              <p>Keine Treffer für „{q.trim()}".</p>
            </div>
          )}

          {results.length > 0 && (
            <ul className="divide-y divide-stone-100">
              {results.map((r) => (
                <li key={r.uid}>
                  <ResultRow row={r} onPick={onClose} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {results.length > 0 && (
          <div className="border-t border-stone-100 bg-stone-50 px-4 py-2 text-[11px] text-stone-500">
            {results.length} Treffer · Klick öffnet den Lead in seiner Liste
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({ row, onPick }: { row: LookupRow; onPick: () => void }) {
  const meta = STATUS_META[row.leadStatus] ?? { label: row.leadStatus, emoji: "•", color: "bg-stone-600" };
  const href = row.listId ? `/lists/${row.listId}?lead=${encodeURIComponent(row.uid)}` : "#";

  return (
    <Link
      href={href}
      onClick={onPick}
      className="flex items-start gap-3 p-4 transition hover:bg-stone-50"
    >
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.color} text-xs text-white`}>
        {meta.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-stone-900">
            {row.firmenname}
          </span>
          {row.listName && (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
              {row.listName}
            </span>
          )}
        </div>
        {row.telefon && (
          <div className="mt-0.5 text-sm font-semibold text-rose-600 tabular-nums">
            📞 {row.telefon}
          </div>
        )}
        <div className="mt-0.5 line-clamp-1 text-xs text-stone-500">
          {row.adresse || `${row.ort} · ${row.dienstleistung}`}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-stone-400">
          <span>{meta.label}</span>
          {row.callCount > 0 && <span>· {row.callCount}× angerufen</span>}
          {row.lastSetterName && (
            <span className="inline-flex items-center gap-1">
              ·{" "}
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: row.lastSetterColor ?? "#525252" }}
              />
              {row.lastSetterName}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
