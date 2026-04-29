"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV: NavItem[] = [
  { href: "/", label: "Suche", icon: <SearchIcon /> },
  { href: "/lists", label: "Listen", icon: <ListIcon /> },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-20 shrink-0 flex-col items-center gap-2 border-r border-stone-200 bg-white py-6 lg:w-60 lg:items-stretch lg:px-4">
      <Link href="/" className="mb-6 flex items-center gap-2 lg:px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-lg font-semibold text-white">S</div>
        <span className="hidden text-base font-semibold lg:inline">Sorex Leadscraper</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
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

      <div className="mt-auto hidden text-xs text-stone-400 lg:block lg:px-3">
        v0.2 · OSM + Google
      </div>
    </aside>
  );
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
