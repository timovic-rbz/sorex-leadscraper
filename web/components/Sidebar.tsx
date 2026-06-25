"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { CommissionSummary, SessionInfo } from "@/lib/types";
import { openPhoneSearch } from "./PhoneSearchTrigger";

/** Provisions-Betrag (USD) kompakt formatieren (ohne Nachkommastellen bei runden Summen). */
function usd(n: number): string {
  return n.toLocaleString("de-DE", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Suche", icon: <SearchIcon />, adminOnly: true },
  { href: "/call", label: "Anruf-Modus", icon: <PhoneNavIcon /> },
  { href: "/lists", label: "Listen", icon: <ListIcon /> },
  { href: "/qualified", label: "Gesettet", icon: <FlameIcon /> },
  { href: "/leaderboard", label: "Ranking", icon: <TrophyIcon /> },
  { href: "/coverage", label: "Karte", icon: <MapIcon />, adminOnly: true },
  { href: "/settings", label: "Settings", icon: <SettingsIcon />, adminOnly: true },
];

// Sprung zwischen den internen Tools (Sales Hub / Leadscraper / …).
// `current: true` = dieses Tool (hervorgehoben, kein ↗). Neue Tools einfach
// hier ergänzen, z.B. Onboarding sobald die URL steht.
interface ToolLink {
  href: string;
  label: string;
  emoji: string;
  current?: boolean;
}

const INTERNAL_TOOLS: ToolLink[] = [
  { href: "https://sales-hub-volles-studio.vercel.app/heute", label: "Sales Hub", emoji: "🎯" },
  { href: "/lists", label: "Leadscraper", emoji: "🔍", current: true },
];

export default function Sidebar({ session }: { session: SessionInfo }) {
  const pathname = usePathname();
  const router = useRouter();
  const [commission, setCommission] = useState<CommissionSummary | null>(null);

  const items = NAV.filter((n) => !n.adminOnly || session.isAdmin);

  // Eigene Monats-Provision laden; bei jedem Seitenwechsel auffrischen, damit ein
  // frisch geschlossener Deal sich zeitnah im Badge zeigt.
  useEffect(() => {
    let active = true;
    fetch("/api/commission")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { me?: CommissionSummary | null } | null) => {
        if (active) setCommission(d?.me ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <DesktopSidebar
        items={items}
        session={session}
        commission={commission}
        pathname={pathname}
        onLogout={logout}
      />
      <MobileBottomNav
        items={items}
        pathname={pathname}
        onLogout={logout}
      />
      <MobileTopBar session={session} commission={commission} onLogout={logout} />
    </>
  );
}

// ===========================================================================
// Desktop
// ===========================================================================

function DesktopSidebar({
  items,
  session,
  commission,
  pathname,
  onLogout,
}: {
  items: NavItem[];
  session: SessionInfo;
  commission: CommissionSummary | null;
  pathname: string;
  onLogout: () => void;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-stone-200 bg-white px-4 py-6 lg:flex">
      <Link
        href={session.isAdmin ? "/" : "/lists"}
        className="mb-6 flex items-center gap-2 px-2"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-900 text-lg font-semibold text-white">
          S
        </div>
        <span className="flex flex-col leading-tight">
          <span className="text-base font-semibold">Soreax</span>
          <span className="text-[11px] font-medium text-stone-400">Leadscraper</span>
        </span>
      </Link>

      {/* Globale Telefonnummer-Suche – über allen Nav-Items */}
      <button
        onClick={openPhoneSearch}
        className="mb-2 flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-2 text-left text-xs text-stone-500 transition hover:bg-stone-100"
        title="Telefonnummer suchen (⌘+K)"
      >
        <span className="flex h-6 w-6 items-center justify-center text-base">📞</span>
        <span className="flex-1">Nummer suchen…</span>
        <kbd className="rounded border border-stone-200 bg-white px-1 py-0.5 text-[9px] font-medium text-stone-500">
          ⌘K
        </kbd>
      </button>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-rose-600 text-white shadow-[0_4px_14px_rgba(225,29,72,0.3)]"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              <span className="flex h-7 w-7 items-center justify-center">{item.icon}</span>
              <span>{item.label === "Settings" ? "Einstellungen" : item.label === "Ranking" ? "Leaderboard" : item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        {/* Sprung in die anderen internen Tools */}
        <div className="rounded-2xl border border-stone-200 p-2">
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
            Interne Tools
          </div>
          <div className="flex flex-col gap-0.5">
            {INTERNAL_TOOLS.map((tool) => {
              const cls = `flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition ${
                tool.current ? "bg-rose-50 text-rose-700" : "text-stone-600 hover:bg-stone-100"
              }`;
              if (tool.current) {
                return (
                  <Link key={tool.href} href={tool.href} className={cls}>
                    <span className="text-base">{tool.emoji}</span>
                    <span className="flex-1">{tool.label}</span>
                  </Link>
                );
              }
              return (
                <a
                  key={tool.href}
                  href={tool.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cls}
                >
                  <span className="text-base">{tool.emoji}</span>
                  <span className="flex-1">{tool.label}</span>
                  <ExternalIcon />
                </a>
              );
            })}
          </div>
        </div>
        {commission && commission.monthTotal > 0 && (
          <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-emerald-50 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                💵 Provision · Monat
              </span>
              <span className="text-[10px] text-stone-400 tabular-nums">
                {commission.activeCustomers} aktiv
              </span>
            </div>
            <div className="mt-0.5 text-xl font-bold tabular-nums text-emerald-700">
              {usd(commission.monthTotal)}
            </div>
            <div className="text-[10px] text-stone-400">
              🔁 {usd(commission.recurringMonth)} · 🏆 {usd(commission.closingMonth)}
            </div>
          </div>
        )}
        {(session.setterName || session.isAdmin) && (
          <div className="flex items-center gap-2 rounded-2xl bg-stone-50 px-3 py-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: session.setterColor ?? "#525252" }}
            >
              {session.setterName ? initials(session.setterName) : "AD"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {session.setterName ?? "Admin"}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-stone-500">
                {session.isAdmin ? "Admin" : "Setter"}
              </div>
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          className="flex items-center justify-center gap-2 rounded-full border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 transition hover:bg-stone-50"
          title="Abmelden"
        >
          <LogoutIcon />
          <span>Abmelden</span>
        </button>
      </div>
    </aside>
  );
}

// ===========================================================================
// Mobile – Bottom-Nav + Top-Bar
// ===========================================================================

function MobileBottomNav({
  items,
  pathname,
  onLogout,
}: {
  items: NavItem[];
  pathname: string;
  onLogout: () => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-stone-200 bg-white/95 backdrop-blur-md shadow-[0_-1px_8px_rgba(0,0,0,0.04)] lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {items.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition ${
              active ? "text-rose-600" : "text-stone-500"
            }`}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-2xl transition ${
                active ? "bg-rose-50" : ""
              }`}
            >
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button
        onClick={onLogout}
        className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium text-stone-500"
        aria-label="Abmelden"
      >
        <span className="flex h-9 w-9 items-center justify-center">
          <LogoutIcon />
        </span>
        <span>Abmelden</span>
      </button>
    </nav>
  );
}

function MobileTopBar({
  session,
  commission,
  onLogout: _onLogout,
}: {
  session: SessionInfo;
  commission: CommissionSummary | null;
  onLogout: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-stone-200 bg-white/95 backdrop-blur-md px-4 py-2.5 lg:hidden"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.625rem)" }}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-900 text-sm font-semibold text-white">
          S
        </div>
        <span className="text-sm font-semibold tracking-tight">Soreax</span>
      </div>
      <div className="flex items-center gap-2">
        {commission && commission.monthTotal > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 tabular-nums"
            title={`Provision diesen Monat · ${commission.activeCustomers} aktive Kunden`}
          >
            💵 {usd(commission.monthTotal)}
          </span>
        )}
        {INTERNAL_TOOLS.filter((tool) => !tool.current).map((tool) => (
          <a
            key={tool.href}
            href={tool.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-base"
            title={`${tool.label} öffnen`}
            aria-label={`${tool.label} öffnen`}
          >
            {tool.emoji}
          </a>
        ))}
        <button
          onClick={openPhoneSearch}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-base text-stone-700"
          title="Telefonnummer suchen"
          aria-label="Telefonnummer suchen"
        >
          📞
        </button>
        {(session.setterName || session.isAdmin) && (
          <div className="flex items-center gap-1.5 rounded-full bg-stone-50 px-2 py-1">
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: session.setterColor ?? "#525252" }}
            >
              {session.setterName ? initials(session.setterName) : "AD"}
            </div>
            <span className="text-xs font-medium text-stone-700">
              {session.setterName ?? "Admin"}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

// ===========================================================================
// Helpers + Icons
// ===========================================================================

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function PhoneNavIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55.47.98.97 1.21C12.15 18.75 13 20.24 13 22" />
      <path d="M14 14.66V17c0 .55-.47.98-.97 1.21C11.85 18.75 11 20.24 11 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-stone-400">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}
