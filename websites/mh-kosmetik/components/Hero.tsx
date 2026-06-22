"use client";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

export function Hero() {
  return (
    <section
      id="hero"
      className="relative isolate overflow-hidden pt-36 lg:pt-40 pb-24 lg:pb-32"
    >
      {/* watermark blobs */}
      <div className="blob -top-32 -left-24 w-[420px] h-[420px] bg-blush" />
      <div className="blob top-40 -right-20 w-[380px] h-[380px] bg-rose/30" />
      <div className="absolute inset-0 grain" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-10 grid lg:grid-cols-2 gap-14 items-center">
        {/* copy */}
        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full bg-blush/70 backdrop-blur px-4 py-1.5 text-xs tracking-[0.22em] uppercase text-cocoa/80"
          >
            <Sparkles size={14} className="text-rose" />
            Kosmetikstudio · Langenfeld
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="mt-6 font-display text-[2.6rem] sm:text-5xl lg:text-[3.6rem] leading-[1.05] tracking-tight text-cocoa text-balance"
          >
            Strahlende Schönheit,
            <span className="block italic text-mauve">die von Herzen kommt.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-6 text-cocoa/75 text-lg max-w-xl leading-relaxed"
          >
            Hochwertige Behandlungen in ruhiger Atmosphäre – mit moderner Technologie und
            handverlesenen Produkten. Ihr System für zeitlose Eleganz, mitten in Langenfeld.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-9 flex flex-wrap gap-4"
          >
            <a
              href="#kontakt"
              className="btn-shine inline-flex items-center gap-2 rounded-full bg-taupe text-cream px-7 py-4 text-sm tracking-widest uppercase hover:bg-cocoa transition-colors shadow-[0_12px_30px_-12px_rgba(107,75,75,0.45)]"
            >
              Jetzt Termin vereinbaren
              <ArrowRight size={16} />
            </a>
            <a
              href="#leistungen"
              className="inline-flex items-center gap-2 rounded-full border border-taupe/40 text-cocoa px-7 py-4 text-sm tracking-widest uppercase hover:bg-blush/50 transition-colors"
            >
              Unsere Leistungen
            </a>
          </motion.div>

          {/* small note */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.7 }}
            className="mt-10 flex items-center gap-4 text-xs tracking-[0.18em] uppercase text-cocoa/55"
          >
            <span className="h-px w-10 bg-taupe/50" />
            Persönlich · Diskret · Sichtbar wirksam
          </motion.div>
        </div>

        {/* image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="relative"
        >
          <div className="relative aspect-[4/5] lg:aspect-[5/6] w-full rounded-[36px] overflow-hidden bg-blush shadow-[0_30px_80px_-30px_rgba(107,75,75,0.45)]">
            <Image
              src="https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1400&q=85&auto=format&fit=crop"
              alt="Entspannte Gesichtsbehandlung im MH Kosmetikstudio"
              fill
              priority
              className="object-cover"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
            {/* subtle warm tint */}
            <div className="absolute inset-0 bg-gradient-to-tr from-rose/20 via-transparent to-cream/10 mix-blend-multiply" />
          </div>

          {/* floating badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="hidden md:flex absolute -left-8 bottom-10 bg-cream/95 backdrop-blur-xl rounded-2xl px-5 py-4 shadow-[0_20px_50px_-20px_rgba(107,75,75,0.4)] gap-4 border border-taupe/15"
          >
            <div className="flex -space-x-2">
              {[
                "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&q=80",
                "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&q=80",
                "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=80&q=80",
              ].map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="w-8 h-8 rounded-full border-2 border-cream object-cover"
                />
              ))}
            </div>
            <div className="text-left">
              <div className="text-[0.7rem] tracking-[0.18em] uppercase text-cocoa/60">
                Über 10.000+ Kundinnen
              </div>
              <div className="font-display text-cocoa mt-0.5 text-sm">
                vertrauen seit 15 Jahren auf MH
              </div>
            </div>
          </motion.div>

          {/* tiny decoration */}
          <div className="hidden lg:block absolute -right-6 top-10 w-24 h-24 rounded-full border border-taupe/30 animate-floaty" />
        </motion.div>
      </div>
    </section>
  );
}
