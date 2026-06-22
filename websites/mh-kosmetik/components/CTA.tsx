"use client";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export function CTA() {
  return (
    <section className="relative py-24 lg:py-32 bg-cream overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="relative rounded-[36px] overflow-hidden bg-gradient-to-br from-taupe to-cocoa shadow-[0_30px_80px_-30px_rgba(107,75,75,0.6)]">
          <div className="absolute inset-0 opacity-25">
            <Image
              src="https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1600&q=85&auto=format&fit=crop"
              alt=""
              fill
              className="object-cover"
              sizes="100vw"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-cocoa/90 via-cocoa/70 to-transparent" />

          <div className="relative grid lg:grid-cols-2 gap-10 items-center p-10 lg:p-16">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-3 text-[0.7rem] tracking-[0.32em] uppercase text-blush"
              >
                <span className="h-px w-8 bg-blush/60" /> Termin sichern
              </motion.div>

              <motion.h3
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7 }}
                className="mt-4 font-display text-4xl lg:text-[3rem] text-cream leading-tight text-balance"
              >
                Bereit für Ihre persönliche
                <span className="italic block text-blush">Schönheitsreise?</span>
              </motion.h3>

              <motion.p
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.1 }}
                className="mt-5 text-cream/80 text-lg max-w-xl leading-relaxed"
              >
                Wir nehmen uns Zeit für ein ausführliches Beratungsgespräch und entwickeln
                gemeinsam Ihren Pflegeplan. Unverbindlich – und ganz ohne Druck.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.2 }}
                className="mt-9 flex flex-wrap gap-4"
              >
                <a
                  href="tel:021731234567"
                  className="btn-shine inline-flex items-center gap-3 rounded-full bg-cream text-cocoa px-7 py-4 text-sm tracking-widest uppercase hover:bg-blush transition-colors"
                >
                  Termin vereinbaren
                  <ArrowRight size={16} />
                </a>
                <a
                  href="mailto:info@mhkosmetik.de"
                  className="inline-flex items-center gap-3 rounded-full border border-cream/40 text-cream px-7 py-4 text-sm tracking-widest uppercase hover:bg-cream/10 transition-colors"
                >
                  E-Mail schreiben
                </a>
              </motion.div>
            </div>

            <div className="hidden lg:flex justify-end">
              <div className="relative w-80 h-80">
                <div className="absolute inset-0 rounded-full border border-blush/30 animate-floaty" />
                <div className="absolute inset-6 rounded-full border border-blush/20" />
                <div className="absolute inset-14 rounded-full bg-blush/20 backdrop-blur grid place-items-center text-center">
                  <div>
                    <div className="font-display italic text-cream text-xl">Termine</div>
                    <div className="mt-2 text-cream/85 text-sm">Mo–Fr 9–19 · Sa 9–14</div>
                    <div className="mt-3 text-cream font-display text-2xl">02173 1234567</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
