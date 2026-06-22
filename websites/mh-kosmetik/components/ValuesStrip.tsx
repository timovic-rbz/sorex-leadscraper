"use client";
import { motion } from "framer-motion";
import { UserCheck, Cpu, Sparkles, HeartHandshake } from "lucide-react";

const values = [
  {
    icon: UserCheck,
    title: "Individuelle Beratung",
    sub: "Maßgeschneiderte Lösungen",
  },
  {
    icon: Cpu,
    title: "Modernste Technologien",
    sub: "Für beste Ergebnisse",
  },
  {
    icon: Sparkles,
    title: "Hygiene auf höchstem Niveau",
    sub: "Ihre Sicherheit ist unser Standard",
  },
  {
    icon: HeartHandshake,
    title: "Wohlfühlatmosphäre",
    sub: "Entspannen & genießen",
  },
];

export function ValuesStrip() {
  return (
    <section className="bg-blush/60 border-y border-taupe/15">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-8 py-12 lg:py-14">
        {values.map(({ icon: Icon, title, sub }, i) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="flex items-center gap-4"
          >
            <div className="shrink-0 grid place-items-center w-14 h-14 rounded-full bg-cream text-cocoa border border-taupe/20">
              <Icon size={22} />
            </div>
            <div>
              <div className="font-display text-cocoa text-lg leading-tight">{title}</div>
              <div className="text-xs uppercase tracking-[0.16em] text-cocoa/60 mt-1">{sub}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
