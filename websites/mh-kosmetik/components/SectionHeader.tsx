"use client";
import { motion } from "framer-motion";
import clsx from "clsx";

export function SectionHeader({
  eyebrow,
  title,
  intro,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={clsx("max-w-2xl", align === "center" ? "mx-auto text-center" : "text-left")}>
      {eyebrow && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.5 }}
          className={clsx(
            "inline-flex items-center gap-3 text-[0.7rem] tracking-[0.32em] uppercase text-rose/90",
            align === "center" ? "justify-center" : "justify-start"
          )}
        >
          <span className="h-px w-8 bg-rose/60" />
          {eyebrow}
          <span className="h-px w-8 bg-rose/60" />
        </motion.div>
      )}
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.7 }}
        className="mt-4 font-display text-4xl lg:text-5xl text-cocoa text-balance leading-tight"
      >
        {title}
      </motion.h2>
      {intro && (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mt-5 text-cocoa/70 text-lg leading-relaxed"
        >
          {intro}
        </motion.p>
      )}
    </div>
  );
}
