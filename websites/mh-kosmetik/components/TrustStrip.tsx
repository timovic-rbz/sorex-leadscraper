"use client";
import { motion } from "framer-motion";
import { Award, Users, Star, Leaf } from "lucide-react";

const items = [
  { icon: Award, title: "Seit über 15 Jahren", sub: "Erfahrung & Leidenschaft" },
  { icon: Users, title: "10.000+ Kundinnen", sub: "vertrauen uns" },
  { icon: Star, title: "4,9 / 5 Sterne", sub: "Bewertung bei Google" },
  { icon: Leaf, title: "Hochwertige Produkte", sub: "für Ihre Haut" },
];

export function TrustStrip() {
  return (
    <section className="relative bg-cream">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 -mt-10 lg:-mt-14 relative z-20">
        <div className="rounded-2xl bg-cream/95 backdrop-blur border border-taupe/15 shadow-[0_20px_60px_-30px_rgba(107,75,75,0.35)] grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-taupe/15 overflow-hidden">
          {items.map(({ icon: Icon, title, sub }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="flex items-center gap-4 px-6 py-6"
            >
              <div className="shrink-0 grid place-items-center w-12 h-12 rounded-full bg-blush text-cocoa">
                <Icon size={20} />
              </div>
              <div>
                <div className="font-display text-cocoa text-base">{title}</div>
                <div className="text-xs text-cocoa/60 tracking-wider uppercase mt-0.5">{sub}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
