"use client";
import Image from "next/image";
import { motion } from "framer-motion";
import { Heart, Quote } from "lucide-react";

const facts = [
  { k: "15+", v: "Jahre Erfahrung" },
  { k: "100%", v: "Persönliche Beratung" },
  { k: "4,9", v: "Google Bewertung" },
];

export function UeberUns() {
  return (
    <section id="ueber-uns" className="relative py-24 lg:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-cream via-blush/40 to-cream" />
      <div className="blob -right-20 top-20 w-[420px] h-[420px] bg-rose/25" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-10 grid lg:grid-cols-12 gap-12 items-center">
        {/* image */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.9 }}
          className="lg:col-span-5 relative"
        >
          <div className="relative aspect-[4/5] rounded-[32px] overflow-hidden shadow-[0_30px_80px_-30px_rgba(107,75,75,0.4)]">
            <Image
              src="https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=1100&q=85&auto=format&fit=crop"
              alt="Inhaberin des Kosmetikstudios MH Langenfeld"
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-cover"
            />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="absolute -bottom-8 -right-4 lg:-right-12 max-w-[260px] bg-cream rounded-2xl p-5 border border-taupe/15 shadow-[0_20px_50px_-20px_rgba(107,75,75,0.35)]"
          >
            <Quote className="text-rose mb-2" size={20} />
            <p className="font-display text-cocoa text-base leading-snug italic">
              „Schönheit beginnt dort, wo man sich selbst wieder fühlt."
            </p>
            <div className="mt-3 text-xs uppercase tracking-[0.18em] text-cocoa/60">
              Melanie H. · Inhaberin
            </div>
          </motion.div>
        </motion.div>

        {/* copy */}
        <div className="lg:col-span-7">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-3 text-[0.7rem] tracking-[0.32em] uppercase text-rose"
          >
            <span className="h-px w-8 bg-rose/60" />
            Schönheit mit System
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="mt-4 font-display text-4xl lg:text-[3rem] leading-tight text-cocoa text-balance"
          >
            Ihre Schönheit ist meine Mission –
            <span className="italic text-mauve"> seit über 15 Jahren.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="mt-6 text-cocoa/75 text-lg leading-relaxed"
          >
            Im Kosmetikstudio MH treffen jahrelange Erfahrung, modernste Technologie und ein
            ehrlicher Blick auf Ihre Haut aufeinander. Ich nehme mir Zeit, höre zu und
            entwickle ein Pflegekonzept, das langfristig wirkt – ohne Versprechen, die wir
            beide nicht halten können.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.25 }}
            className="mt-10 grid grid-cols-3 gap-6 max-w-md"
          >
            {facts.map((f) => (
              <div key={f.v}>
                <div className="font-display text-3xl text-cocoa">{f.k}</div>
                <div className="text-xs tracking-[0.18em] uppercase text-cocoa/55 mt-1">
                  {f.v}
                </div>
              </div>
            ))}
          </motion.div>

          <motion.a
            href="#kontakt"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.35 }}
            className="btn-shine mt-10 inline-flex items-center gap-3 rounded-full bg-cocoa text-cream px-7 py-4 text-sm tracking-widest uppercase hover:bg-mauve transition-colors"
          >
            <Heart size={16} className="text-rose" />
            Mehr über mich
          </motion.a>
        </div>
      </div>
    </section>
  );
}
