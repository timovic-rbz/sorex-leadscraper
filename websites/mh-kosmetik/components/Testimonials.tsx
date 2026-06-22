"use client";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { SectionHeader } from "./SectionHeader";

const stimmen = [
  {
    name: "Melanie S.",
    role: "Kundin seit 2019",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80&auto=format&fit=crop",
    text:
      "Eine absolute Wohlfühloase. Meine Haut hat sich noch nie so gut angefühlt – und Melanie nimmt sich wirklich Zeit für jede einzelne Kundin.",
  },
  {
    name: "Sandra K.",
    role: "Kundin seit 2021",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&q=80&auto=format&fit=crop",
    text:
      "Professionell, herzlich und mit sichtbaren Ergebnissen. Ich komme immer wieder gern – auch wegen der ruhigen, hochwertigen Atmosphäre.",
  },
  {
    name: "Jessica R.",
    role: "Kundin seit 2022",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&q=80&auto=format&fit=crop",
    text:
      "Die beste Entscheidung für meine Haut. Einfach nur empfehlenswert. Die Beratung war ehrlich und der Plan hat von Anfang an funktioniert.",
  },
  {
    name: "Nicole M.",
    role: "Kundin seit 2018",
    avatar: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200&q=80&auto=format&fit=crop",
    text:
      "Tolles Ambiente, erstklassige Behandlung und sehr kompetente Beratung. Hier fühlt man sich vom ersten Moment an gut aufgehoben.",
  },
];

export function Testimonials() {
  return (
    <section className="relative py-24 lg:py-32 bg-cream">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeader
          eyebrow="Kundenstimmen"
          title="Was unsere Kundinnen sagen."
          intro="Ehrliche Worte von Menschen, die schon länger Teil unserer kleinen MH-Familie sind."
        />

        <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
          {stimmen.map((s, i) => (
            <motion.figure
              key={s.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              className="hover-lift rounded-3xl bg-blush/50 border border-taupe/15 p-6 lg:p-7 flex flex-col"
            >
              <div className="flex gap-0.5 text-rose">
                {Array.from({ length: 5 }).map((_, k) => (
                  <Star key={k} size={14} className="fill-rose stroke-rose" />
                ))}
              </div>

              <blockquote className="mt-4 text-cocoa/80 leading-relaxed text-[0.97rem] flex-1 italic">
                „{s.text}"
              </blockquote>

              <figcaption className="mt-6 flex items-center gap-3 pt-5 border-t border-taupe/15">
                <img
                  src={s.avatar}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover border-2 border-cream"
                />
                <div>
                  <div className="font-display text-cocoa text-base leading-tight">{s.name}</div>
                  <div className="text-[0.7rem] tracking-[0.18em] uppercase text-cocoa/55 mt-0.5">
                    {s.role}
                  </div>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  );
}
