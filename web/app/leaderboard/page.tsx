"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeaderboardRow } from "@/lib/types";

type Window = "today" | "7d" | "30d" | "all";

const WINDOW_LABELS: Record<Window, string> = {
  today: "Heute",
  "7d": "Letzte 7 Tage",
  "30d": "Letzte 30 Tage",
  all: "All-time",
};

export default function LeaderboardPage() {
  const [window, setWindow] = useState<Window>("7d");
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    fetch(`/api/leaderboard?window=${window}`)
      .then((r) => r.json())
      .then((d: { rows?: LeaderboardRow[]; error?: string }) => {
        if (d.error) throw new Error(d.error);
        setRows(d.rows ?? []);
      })
      .catch((e) => setError((e as Error).message));
  }, [window]);

  const sorted = useMemo(
    () =>
      (rows ?? [])
        .map((r) => ({ ...r, score: r.interested + r.callScheduled * 2 + r.won * 5 }))
        .sort((a, b) => b.score - a.score),
    [rows],
  );

  const podium = sorted.slice(0, 3);
  const rest = sorted.slice(3);
  const maxScore = Math.max(1, ...sorted.map((r) => r.score));

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">🏆 Leaderboard</h1>
          <p className="mt-2 text-sm text-stone-500">
            Wer hat am meisten gesettet? Punkte: 1× Interessiert · 2× Call vereinbart · 5× Kunde.
          </p>
        </div>
        <div className="flex gap-2 rounded-full bg-stone-100 p-1">
          {(Object.keys(WINDOW_LABELS) as Window[]).map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                window === w ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {WINDOW_LABELS[w]}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="card mb-6 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          ❌ {error}
        </div>
      )}

      {rows === null && <p className="text-stone-500">Lade...</p>}

      {rows && rows.length === 0 && (
        <div className="card flex flex-col items-center gap-4 p-12 text-center">
          <div className="text-5xl">🎯</div>
          <p className="text-stone-600">Noch keine Aktivität in diesem Zeitraum.</p>
        </div>
      )}

      {sorted.length > 0 && (
        <>
          {/* Podium */}
          {podium.length > 0 && (
            <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[1, 0, 2].map((podiumIdx) => {
                const row = podium[podiumIdx];
                if (!row) return <div key={podiumIdx} />;
                const place = podiumIdx + 1;
                return <PodiumCard key={row.setterId} row={row} place={place} score={row.score} />;
              })}
            </div>
          )}

          {/* Full ranking */}
          <div className="space-y-2">
            {sorted.map((r, i) => (
              <RankRow key={r.setterId} row={r} place={i + 1} score={r.score} maxScore={maxScore} />
            ))}
            {rest.length === 0 && podium.length > 0 && (
              <p className="text-center text-xs text-stone-400">Volle Rangliste oben.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PodiumCard({
  row,
  place,
  score,
}: {
  row: LeaderboardRow;
  place: number;
  score: number;
}) {
  const heights = ["h-44", "h-36", "h-28"];
  const medals = ["🥇", "🥈", "🥉"];
  const accents = ["from-amber-300 to-amber-500", "from-stone-300 to-stone-500", "from-orange-400 to-orange-600"];

  return (
    <div className="flex flex-col items-center">
      <div className="mb-3 flex flex-col items-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white shadow-lg ring-4 ring-white"
          style={{ background: row.color }}
        >
          {initials(row.name)}
        </div>
        <div className="mt-2 text-sm font-semibold">{row.name}</div>
        <div className="text-xs text-stone-500">{row.totalSet} gesettet</div>
      </div>
      <div
        className={`relative w-full rounded-t-2xl bg-gradient-to-b ${accents[place - 1]} ${heights[place - 1]} flex items-start justify-center pt-3 text-white shadow-inner`}
      >
        <div className="text-center">
          <div className="text-3xl">{medals[place - 1]}</div>
          <div className="mt-1 text-xs uppercase tracking-wide opacity-80">Platz {place}</div>
          <div className="mt-1 text-2xl font-bold">{score}</div>
          <div className="text-[10px] uppercase tracking-wide opacity-80">Punkte</div>
        </div>
      </div>
    </div>
  );
}

function RankRow({
  row,
  place,
  score,
  maxScore,
}: {
  row: LeaderboardRow;
  place: number;
  score: number;
  maxScore: number;
}) {
  const pct = Math.max(2, Math.round((score / maxScore) * 100));
  const placeEmoji = place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : null;
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center text-xl font-bold text-stone-400">
        {placeEmoji ?? `#${place}`}
      </div>
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ background: row.color }}
      >
        {initials(row.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="font-semibold">{row.name}</span>
          <span className="text-sm font-bold tabular-nums text-stone-900">{score} Pkt</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: row.color }}
          />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
          <span>🔥 {row.interested} interessiert</span>
          <span>📅 {row.callScheduled} Call vereinbart</span>
          <span>🏆 {row.won} Kunde</span>
          <span>📞 {row.totalCalls} Anrufversuche</span>
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
