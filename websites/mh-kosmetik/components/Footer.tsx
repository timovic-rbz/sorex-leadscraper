"use client";
import { useState } from "react";
import { Facebook, Instagram, Mail, MapPin, Phone, Send } from "lucide-react";
import { Logo } from "./Logo";

export function Footer() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <footer id="kontakt" className="bg-blush/70 relative">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-taupe/30 to-transparent" />

      {/* newsletter */}
      <div className="bg-taupe/95 text-cream">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 py-10 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h4 className="font-display text-2xl">Bleiben Sie strahlend informiert.</h4>
            <p className="text-cream/85 mt-2 text-sm">
              Tipps, Angebote &amp; Neuigkeiten direkt in Ihr Postfach. Jederzeit kündbar.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
              setEmail("");
            }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ihre E-Mail-Adresse"
              className="flex-1 rounded-full bg-cream/15 border border-cream/25 placeholder-cream/60 text-cream px-5 py-3.5 outline-none focus:bg-cream/20 focus:border-cream/50"
            />
            <button
              type="submit"
              className="btn-shine inline-flex items-center justify-center gap-2 rounded-full bg-cream text-cocoa px-6 py-3.5 text-sm uppercase tracking-widest hover:bg-blush transition-colors"
            >
              <Send size={14} />
              Anmelden
            </button>
          </form>
          {sent && (
            <p className="md:col-span-2 text-sm text-cream/90 -mt-2">
              Vielen Dank – wir melden uns bald.
            </p>
          )}
        </div>
      </div>

      {/* main */}
      <div className="mx-auto max-w-7xl px-6 lg:px-10 py-16 grid grid-cols-2 md:grid-cols-4 gap-10">
        <div className="col-span-2 md:col-span-1">
          <h5 className="font-display text-cocoa text-lg">Kontakt</h5>
          <div className="mt-5 space-y-3 text-cocoa/75 text-sm">
            <div className="flex items-start gap-3">
              <MapPin size={16} className="mt-0.5 text-rose" />
              <div>
                Kosmetikstudio MH<br />
                Hauptstraße 123<br />
                40764 Langenfeld
              </div>
            </div>
            <a href="tel:021731234567" className="flex items-center gap-3 hover:text-cocoa">
              <Phone size={16} className="text-rose" />
              02173 1234567
            </a>
            <a href="mailto:info@mhkosmetik.de" className="flex items-center gap-3 hover:text-cocoa">
              <Mail size={16} className="text-rose" />
              info@mhkosmetik.de
            </a>
          </div>
        </div>

        <div>
          <h5 className="font-display text-cocoa text-lg">Öffnungszeiten</h5>
          <div className="mt-5 space-y-2 text-cocoa/75 text-sm">
            <div className="flex justify-between gap-4">
              <span>Mo – Fr</span>
              <span>9:00 – 19:00</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Sa</span>
              <span>9:00 – 14:00</span>
            </div>
            <div className="text-cocoa/55 text-xs mt-3">und nach Vereinbarung</div>
          </div>
          <div className="mt-5 flex gap-3">
            <a
              href="#"
              className="grid place-items-center w-9 h-9 rounded-full bg-cocoa text-cream hover:bg-rose transition-colors"
              aria-label="Facebook"
            >
              <Facebook size={15} />
            </a>
            <a
              href="#"
              className="grid place-items-center w-9 h-9 rounded-full bg-cocoa text-cream hover:bg-rose transition-colors"
              aria-label="Instagram"
            >
              <Instagram size={15} />
            </a>
          </div>
        </div>

        <div>
          <h5 className="font-display text-cocoa text-lg">Quick Links</h5>
          <ul className="mt-5 space-y-2 text-cocoa/75 text-sm">
            <li><a href="#hero" className="hover:text-cocoa">Startseite</a></li>
            <li><a href="#leistungen" className="hover:text-cocoa">Leistungen</a></li>
            <li><a href="#ueber-uns" className="hover:text-cocoa">Über uns</a></li>
            <li><a href="#kontakt" className="hover:text-cocoa">Kontakt</a></li>
            <li><a href="#kontakt" className="hover:text-cocoa">Online Termin</a></li>
          </ul>
        </div>

        <div className="col-span-2 md:col-span-1">
          <Logo withTagline />
        </div>
      </div>

      <div className="border-t border-taupe/15">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 py-6 flex flex-col md:flex-row justify-between items-center gap-3 text-xs text-cocoa/55">
          <div>© {new Date().getFullYear()} Kosmetikstudio MH · Alle Rechte vorbehalten.</div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-cocoa">Datenschutz</a>
            <a href="#" className="hover:text-cocoa">Impressum</a>
            <a href="#" className="hover:text-cocoa">AGB</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
