"use client";
import { motion } from "framer-motion";
import { ArrowUpRight, Sparkles, Zap, Hand } from "lucide-react";
import Image from "next/image";
import { SectionHeader } from "./SectionHeader";

const leistungen = [
  {
    icon: Sparkles,
    title: "Gesichtsbehandlungen",
    desc: "Regenerierende Pflege für strahlende, gesunde Haut – mit sichtbaren Ergebnissen ab der ersten Anwendung.",
    bullets: ["Tiefenreinigung", "Anti-Aging-Programme", "Hydra-Facial & Microneedling"],
    image:
      "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=900&q=85&auto=format&fit=crop",
  },
  {
    icon: Zap,
    title: "Dauerhafte Haarentfernung",
    desc: "Sanfte, effektive Technologie für dauerhaft glatte Haut. Für Sie und Ihn – schmerzarm und hautschonend.",
    bullets: ["Diodenlaser-Technologie", "Alle Hauttypen", "Schnelle Behandlung"],
    image:
      "https://images.unsplash.com/photo-1607779097040-26e80aa78e66?w=900&q=85&auto=format&fit=crop",
  },
  {
    icon: Hand,
    title: "Maniküre & Pediküre",
    desc: "Gepflegte Hände & Füße sind Ihre Visitenkarte. Für ein rundum perfektes Gefühl – im Studio und im Alltag.",
    bullets: ["Spa-Maniküre", "Medizinische Fußpflege", "Shellac & Gel-Modellage"],
    image:
      "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=900&q=85&auto=format&fit=crop",
  },
];

export function Leistungen() {
  return (
    <section id="leistungen" className="relative py-24 lg:py-32 bg-cream">
      <div className="blob top-20 -left-32 w-[400px] h-[400px] bg-blush/70" />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeader
          eyebrow="Unsere Leistungen"
          title="Behandlungen, die wirken – und sich anfühlen wie ein kleines Ritual."
          intro="Jede Behandlung wird individuell auf Ihre Haut, Ihre Wünsche und Ihren Alltag abgestimmt. Modern, hochwertig, mit Liebe zum Detail."
        />

        <div className="mt-16 grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {leistungen.map((l, i) => (
            <motion.article
              key={l.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.7, delay: i * 0.1 }}
              className="group hover-lift relative overflow-hidden rounded-[28px] bg-blush/50 border border-taupe/15 p-2 flex flex-col"
            >
              <div className="relative aspect-[4/3] rounded-[22px] overflow-hidden">
                <Image
                  src={l.image}
                  alt={l.title}
                  fill
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  className="object-cover transition-transform duration-[1200ms] group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-cocoa/40 via-transparent to-transparent" />
                <div className="absolute top-4 left-4 grid place-items-center w-11 h-11 rounded-full bg-cream/95 text-cocoa shadow">
                  <l.icon size={18} />
                </div>
              </div>

              <div className="p-6 lg:p-7 flex flex-col flex-1">
                <h3 className="font-display text-2xl text-cocoa">{l.title}</h3>
                <p className="mt-3 text-cocoa/70 leading-relaxed text-[0.95rem]">{l.desc}</p>

                <ul className="mt-5 space-y-2">
                  {l.bullets.map((b) => (
                    <li
                      key={b}
                      className="flex items-center gap-2 text-sm text-cocoa/75"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-rose" />
                      {b}
                    </li>
                  ))}
                </ul>

                <a
                  href="#kontakt"
                  className="mt-6 inline-flex items-center justify-between rounded-full bg-cream border border-taupe/20 px-5 py-3 text-sm tracking-wider uppercase text-cocoa group-hover:bg-cocoa group-hover:text-cream group-hover:border-cocoa transition-colors"
                >
                  Mehr erfahren
                  <ArrowUpRight size={16} className="transition-transform group-hover:rotate-45" />
                </a>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
