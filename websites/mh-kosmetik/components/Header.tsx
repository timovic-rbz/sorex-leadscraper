"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";

const nav = [
  { label: "Startseite", href: "#hero" },
  { label: "Leistungen", href: "#leistungen" },
  { label: "Über uns", href: "#ueber-uns" },
  { label: "Kontakt", href: "#kontakt" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={clsx(
        "fixed top-0 inset-x-0 z-50 transition-all duration-500",
        scrolled
          ? "bg-cream/85 backdrop-blur-xl border-b border-taupe/15 py-3"
          : "bg-transparent py-5"
      )}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-10 flex items-center justify-between">
        <a href="#hero" aria-label="MH Kosmetik">
          <Logo />
        </a>

        <nav className="hidden md:flex items-center gap-10">
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="group relative text-[0.95rem] text-cocoa/85 hover:text-cocoa transition-colors"
            >
              {n.label}
              <span className="absolute left-0 -bottom-1 h-px w-0 bg-rose transition-all duration-500 group-hover:w-full" />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="#kontakt"
            className="btn-shine hidden md:inline-flex items-center gap-2 rounded-full bg-taupe text-cream px-6 py-3 text-sm tracking-wider uppercase hover:bg-cocoa transition-colors"
          >
            Online Termin
          </a>
          <button
            className="md:hidden text-cocoa p-2"
            onClick={() => setOpen(!open)}
            aria-label="Menü"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* mobile menu */}
      <div
        className={clsx(
          "md:hidden overflow-hidden transition-all duration-500 bg-cream border-t border-taupe/10",
          open ? "max-h-96" : "max-h-0"
        )}
      >
        <div className="px-6 py-6 flex flex-col gap-5">
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="text-cocoa text-lg font-display"
            >
              {n.label}
            </a>
          ))}
          <a
            href="#kontakt"
            onClick={() => setOpen(false)}
            className="mt-2 inline-flex items-center justify-center rounded-full bg-taupe text-cream px-6 py-3 text-sm tracking-wider uppercase"
          >
            Online Termin
          </a>
        </div>
      </div>
    </header>
  );
}
