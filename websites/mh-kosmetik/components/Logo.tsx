import clsx from "clsx";

export function Logo({ className, withTagline = false }: { className?: string; withTagline?: boolean }) {
  return (
    <div className={clsx("flex flex-col leading-none", className)}>
      <div className="font-display text-3xl tracking-wide">
        <span className="text-cocoa">M</span>
        <span className="text-rose">H</span>
      </div>
      <div className="font-display text-[0.78rem] tracking-[0.32em] uppercase text-cocoa/80 mt-1">
        Kosmetik
      </div>
      {withTagline && (
        <div className="mt-2 text-[0.7rem] tracking-[0.22em] uppercase text-mauve/80 italic font-sans">
          Mit Liebe. Für Ihre Schönheit.
        </div>
      )}
    </div>
  );
}
