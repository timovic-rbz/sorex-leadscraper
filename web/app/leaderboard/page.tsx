"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeaderboardRow } from "@/lib/types";
import { useSession } from "@/lib/session-context";

type Win = "today" | "7d" | "30d" | "all";

const WINDOW_LABELS: Record<Win, string> = {
  today: "Heute",
  "7d": "Diese Woche",
  "30d": "Dieser Monat",
  all: "All-time",
};

interface Scored extends LeaderboardRow {
  score: number;
}

export default function LeaderboardPage() {
  const me = useSession();
  const [win, setWin] = useState<Win>("7d");
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setRows(null);
    fetch(`/api/leaderboard?window=${win}`)
      .then((r) => r.json())
      .then((d: { rows?: LeaderboardRow[]; error?: string }) => {
        if (d.error) throw new Error(d.error);
        setRows(d.rows ?? []);
      })
      .catch((e) => setError((e as Error).message));
  }, [win]);

  const sorted: Scored[] = useMemo(
    () =>
      (rows ?? [])
        .map((r) => ({ ...r, score: r.interested + r.callScheduled * 2 + r.won * 5 }))
        .sort((a, b) => b.score - a.score),
    [rows],
  );

  const podium = sorted.slice(0, 3);
  const maxScore = Math.max(1, ...sorted.map((r) => r.score));
  const myRow = me?.setterId ? sorted.find((r) => r.setterId === me.setterId) : null;
  const myRank = myRow ? sorted.findIndex((r) => r.setterId === myRow.setterId) + 1 : null;

  const countdownMs = nextWindowEnd(win, now) - now;

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">🏆 Leaderboard</h1>
        <p className="mt-1 text-xs text-stone-500 sm:mt-2 sm:text-sm">
          Punkte: 1×🔥 · 2×📅 · 5×🏆
        </p>

        {/* Tabs – auf mobile horizontal scrollbar, kein Wrap */}
        <div className="-mx-4 mt-4 overflow-x-auto px-4 lg:mx-0 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex gap-1 rounded-full bg-stone-100 p-1">
            {(Object.keys(WINDOW_LABELS) as Win[]).map((w) => (
              <button
                key={w}
                onClick={() => setWin(w)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition sm:px-4 sm:text-sm ${
                  win === w ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {WINDOW_LABELS[w]}
              </button>
            ))}
          </div>
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
          {/* ============================================================
              Stage – heller Hero mit Podium-Effekt
              ============================================================ */}
          <div className="relative mb-6 overflow-hidden rounded-2xl border border-stone-200 bg-gradient-to-b from-rose-50/60 via-white to-amber-50/40 px-3 py-6 sm:rounded-3xl sm:px-6 sm:py-10 lg:px-12 lg:py-14">
            {/* Spotlight auf den Sieger */}
            <div
              className="pointer-events-none absolute left-1/2 top-0 h-56 w-[320px] -translate-x-1/2 rounded-full bg-amber-200/40 blur-3xl sm:h-72 sm:w-[480px]"
              aria-hidden
            />

            <div className="relative grid grid-cols-3 items-end gap-2 sm:gap-6">
              <PodiumColumn row={podium[1]} place={2} highlight={me?.setterId === podium[1]?.setterId} />
              <PodiumColumn row={podium[0]} place={1} highlight={me?.setterId === podium[0]?.setterId} />
              <PodiumColumn row={podium[2]} place={3} highlight={me?.setterId === podium[2]?.setterId} />
            </div>

            {/* Countdown + persönlicher Status */}
            <div className="relative mt-5 flex flex-wrap items-center justify-center gap-2 text-xs sm:mt-8 sm:gap-3 sm:text-sm">
              {win !== "all" && countdownMs > 0 && (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/90 px-3 py-1.5 font-medium text-stone-700 shadow-sm sm:gap-2 sm:px-4 sm:py-2">
                  <span aria-hidden>⏰</span>
                  <span>Endet in {formatCountdown(countdownMs)}</span>
                </div>
              )}
              {myRow && myRank && (
                <div
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium text-white shadow-sm sm:gap-2 sm:px-4 sm:py-2"
                  style={{ background: myRow.color }}
                >
                  <span aria-hidden>✦</span>
                  <span>
                    Du · {myRow.score} Pkt · Platz {myRank}/{sorted.length}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ============================================================
              Team-Metriken
              ============================================================ */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              icon="🔥"
              label="Interessiert"
              value={sum(sorted, "interested")}
              color="bg-orange-50 text-orange-700"
            />
            <MetricCard
              icon="📅"
              label="Call vereinbart"
              value={sum(sorted, "callScheduled")}
              color="bg-purple-50 text-purple-700"
            />
            <MetricCard
              icon="🏆"
              label="Neue Kunden"
              value={sum(sorted, "won")}
              color="bg-emerald-50 text-emerald-700"
            />
            <MetricCard
              icon="📞"
              label="Anrufversuche"
              value={sum(sorted, "totalCalls")}
              color="bg-stone-50 text-stone-700"
            />
          </div>

          {/* ============================================================
              Volle Rangliste – Tabelle auf sm+, Card-Liste auf mobile
              ============================================================ */}
          <div className="card overflow-hidden p-0">
            {/* Tabellen-Header nur ab sm */}
            <div className="hidden sm:grid grid-cols-[60px_minmax(0,1fr)_repeat(4,minmax(0,80px))_minmax(80px,120px)] items-center gap-3 border-b border-stone-100 bg-stone-50/60 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-stone-500 sm:gap-6 sm:px-6">
              <div>Rang</div>
              <div>Setter</div>
              <div className="text-right">🔥</div>
              <div className="text-right">📅</div>
              <div className="text-right">🏆</div>
              <div className="text-right">📞</div>
              <div className="text-right">Punkte</div>
            </div>
            <div className="divide-y divide-stone-100">
              {sorted.map((r, i) => (
                <RankRow
                  key={r.setterId}
                  row={r}
                  place={i + 1}
                  maxScore={maxScore}
                  isMe={me?.setterId === r.setterId}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Podium-Säule
// ============================================================================

function PodiumColumn({
  row,
  place,
  highlight,
}: {
  row: Scored | undefined;
  place: 1 | 2 | 3;
  highlight: boolean;
}) {
  if (!row) {
    return (
      <div className="flex flex-col items-center justify-end">
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-stone-100 text-stone-300 sm:h-20 sm:w-20">
          ?
        </div>
        <div className="mt-1 h-1 text-xs text-stone-400">—</div>
      </div>
    );
  }

  // Platz 1 ist größer, breiter und höher
  const cfg = {
    1: {
      avatar: "h-16 w-16 sm:h-28 sm:w-28 text-base sm:text-2xl ring-2 sm:ring-4 ring-amber-200",
      podiumHeight: "h-32 sm:h-52",
      gradient: "from-amber-300 via-amber-400 to-amber-500",
      medal: "🥇",
      nameSize: "text-xs sm:text-lg",
      scoreSize: "text-xl sm:text-4xl",
    },
    2: {
      avatar: "h-12 w-12 sm:h-24 sm:w-24 text-xs sm:text-xl ring-2 sm:ring-4 ring-stone-200",
      podiumHeight: "h-24 sm:h-36",
      gradient: "from-stone-300 via-stone-400 to-stone-500",
      medal: "🥈",
      nameSize: "text-xs sm:text-base",
      scoreSize: "text-base sm:text-3xl",
    },
    3: {
      avatar: "h-12 w-12 sm:h-24 sm:w-24 text-xs sm:text-xl ring-2 sm:ring-4 ring-orange-200",
      podiumHeight: "h-20 sm:h-28",
      gradient: "from-orange-300 via-orange-400 to-orange-500",
      medal: "🥉",
      nameSize: "text-xs sm:text-base",
      scoreSize: "text-base sm:text-3xl",
    },
  }[place];

  return (
    <div className="flex flex-col items-center justify-end">
      {/* Trophy-Badge */}
      <div className="relative">
        <div
          className={`flex items-center justify-center rounded-full text-white shadow-xl ${cfg.avatar} ${
            highlight ? "outline outline-4 outline-offset-2 outline-rose-500" : ""
          }`}
          style={{ background: row.color }}
        >
          {initials(row.name)}
        </div>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white px-2 py-1 text-base shadow-md ring-1 ring-stone-200 sm:text-lg">
          {cfg.medal}
        </div>
      </div>

      <div className={`mt-2 truncate max-w-full text-center font-semibold text-stone-900 sm:mt-4 ${cfg.nameSize}`}>
        {row.name}
      </div>
      <div className="text-[10px] text-stone-500 sm:text-xs">{row.totalSet} gesettet</div>

      {/* Pedestal */}
      <div
        className={`mt-2 w-full overflow-hidden rounded-t-xl bg-gradient-to-b text-white shadow-inner sm:mt-4 sm:rounded-t-2xl ${cfg.gradient} ${cfg.podiumHeight}`}
      >
        <div className="flex h-full flex-col items-center justify-start pt-2 sm:pt-3">
          <div className="text-[8px] font-semibold uppercase tracking-wider opacity-90 sm:text-[10px]">
            Platz {place}
          </div>
          <div className={`mt-1 font-bold leading-none tabular-nums ${cfg.scoreSize}`}>{row.score}</div>
          <div className="mt-1 text-[8px] uppercase tracking-wider opacity-90 sm:text-[10px]">Pkt</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Ranking-Zeile
// ============================================================================

function RankRow({
  row,
  place,
  maxScore,
  isMe,
}: {
  row: Scored;
  place: number;
  maxScore: number;
  isMe: boolean;
}) {
  const pct = Math.max(2, Math.round((row.score / maxScore) * 100));
  const placeBadge = place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : `#${place}`;

  return (
    <div className={`transition ${isMe ? "bg-rose-50/50" : "hover:bg-stone-50"}`}>
      {/* ============ Mobile: kompakte Card-Reihe ============ */}
      <div className="flex flex-col gap-2 px-4 py-3 sm:hidden">
        <div className="flex items-center gap-3">
          <div className="w-7 shrink-0 text-center text-sm font-semibold text-stone-500">
            {placeBadge}
          </div>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: row.color }}
          >
            {initials(row.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-stone-900">{row.name}</span>
              {isMe && (
                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-rose-700">
                  Du
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-base font-bold tabular-nums text-stone-900">{row.score}</div>
            <div className="text-[9px] uppercase tracking-wider text-stone-400">Pkt</div>
          </div>
        </div>
        <div className="ml-10 flex items-center gap-3 text-[11px] text-stone-500">
          <span>🔥 {row.interested}</span>
          <span>📅 {row.callScheduled}</span>
          <span>🏆 {row.won}</span>
          <span>📞 {row.totalCalls}</span>
        </div>
        <div className="ml-10 h-1.5 overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: row.color }}
          />
        </div>
      </div>

      {/* ============ Desktop: Tabellen-Grid ============ */}
      <div className="hidden sm:grid grid-cols-[60px_minmax(0,1fr)_repeat(4,minmax(0,80px))_minmax(80px,120px)] items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6">
        <div className="text-base font-semibold text-stone-500">{placeBadge}</div>
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: row.color }}
          >
            {initials(row.name)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-stone-900">
              {row.name}
              {isMe && (
                <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700">
                  Du
                </span>
              )}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: row.color }}
              />
            </div>
          </div>
        </div>
        <div className="text-right text-sm font-medium tabular-nums text-stone-700">{row.interested}</div>
        <div className="text-right text-sm font-medium tabular-nums text-stone-700">{row.callScheduled}</div>
        <div className="text-right text-sm font-medium tabular-nums text-stone-700">{row.won}</div>
        <div className="text-right text-sm tabular-nums text-stone-500">{row.totalCalls}</div>
        <div className="text-right text-base font-bold tabular-nums text-stone-900">{row.score}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Team-Metrik-Karte
// ============================================================================

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold tabular-nums text-stone-900">{value}</div>
        <div className="text-xs uppercase tracking-wider text-stone-500">{label}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function sum<K extends keyof Scored>(rows: Scored[], k: K): number {
  return rows.reduce((acc, r) => acc + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Ende des aktuellen Fensters:
 * - today: heute 23:59:59
 * - 7d: in 7 Tagen ab Wochenstart (rolling)
 * - 30d: in 30 Tagen ab Monatsstart (rolling)
 * - all: kein Ende
 *
 * "Rolling" passt zur Backend-Abfrage (sinceIso = now - N Tage), nicht zum Kalender-Wochenwechsel,
 * d.h. der Countdown zeigt wann der ältere Eintrag aus dem Fenster fällt — gibt Druck, jetzt zu setzen.
 */
function nextWindowEnd(win: Win, now: number): number {
  if (win === "today") {
    const d = new Date(now);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  if (win === "7d") return now + 7 * 24 * 60 * 60 * 1000;
  if (win === "30d") return now + 30 * 24 * 60 * 60 * 1000;
  return now;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, "0")}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
