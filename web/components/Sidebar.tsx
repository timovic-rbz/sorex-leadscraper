"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SessionInfo } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Suche", icon: <SearchIcon />, adminOnly: true },
  { href: "/lists", label: "Listen", icon: <ListIcon /> },
  { href: "/leaderboard", label: "Leaderboard", icon: <TrophyIcon /> },
  { href: "/settings", label: "Einstellungen", icon: <SettingsIcon />, adminOnly: true },
];

export default function Sidebar({ session }: { session: SessionInfo }) {
  const pathname = usePathname();
  const router = useRouter();

  const items = NAV.filter((n) => !n.adminOnly || session.isAdmin);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sticky top-0 flex h-screen w-20 shrink-0 flex-col items-center gap-2 border-r border-stone-200 bg-white py-6 lg:w-60 lg:items-stretch lg:px-4">
      <Link href={session.isAdmin ? "/" : "/lists"} className="mb-6 flex items-center gap-2 lg:px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-lg font-semibold text-white">
          S
        </div>
        <span className="hidden text-base font-semibold lg:inline">Soreax Leadscraper</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-rose-600 text-white shadow-[0_4px_12px_rgba(225,29,72,0.25)]"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              <span className="flex h-7 w-7 items-center justify-center">{item.icon}</span>
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 lg:px-1">
        {(session.setterName || session.isAdmin) && (
          <div className="hidden items-center gap-2 rounded-2xl bg-stone-50 px-3 py-2 lg:flex">
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
          onClick={logout}
          className="flex items-center justify-center gap-2 rounded-full border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 transition"
          title="Abmelden"
        >
          <LogoutIcon />
          <span className="hidden lg:inline">Abmelden</span>
        </button>
      </div>
    </aside>
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

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
