"use client";

/**
 * Öffnet das Google-Knowledge-Panel (das Business-Profil rechts neben den
 * Suchergebnissen) in einem neuen Tab. URL ist eine ganz normale Google-Suche
 * nach "<Firmenname> <Ort>" — Google blendet bei einem eindeutigen Match
 * automatisch das Profil mit Bewertungen, Fotos, Öffnungszeiten ein.
 *
 * stopPropagation auf onClick, sodass der Klick in einem umgebenden klickbaren
 * Lead-Card-Container nicht das Modal mit aufpoppt.
 */
export function GoogleProfileButton({
  name,
  ort,
  size = "sm",
  withLabel = false,
}: {
  name: string;
  ort?: string;
  size?: "sm" | "md";
  withLabel?: boolean;
}) {
  const q = [name, ort].filter(Boolean).join(" ").trim();
  if (!q) return null;
  const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;

  const box =
    size === "sm"
      ? `h-7 ${withLabel ? "px-2.5" : "w-7"}`
      : `h-9 ${withLabel ? "px-3" : "w-9"}`;
  const iconSize = size === "sm" ? 14 : 18;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white ${box} text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50`}
      title="Google-Profil ansehen"
      aria-label="Google-Profil ansehen"
    >
      <GoogleLogo size={iconSize} />
      {withLabel && <span>Profil</span>}
    </a>
  );
}

function GoogleLogo({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M21.35 11.1H12v3.2h5.35c-.23 1.38-.95 2.55-2.02 3.34v2.78h3.27c1.91-1.76 3.01-4.36 3.01-7.42 0-.72-.06-1.42-.18-2.1z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.97-.9 6.63-2.42l-3.27-2.78c-.9.6-2.06.97-3.36.97-2.58 0-4.78-1.74-5.56-4.08H3.06v2.86C4.7 19.83 8.04 22 12 22z"
        fill="#34A853"
      />
      <path
        d="M6.44 13.69c-.2-.6-.31-1.24-.31-1.9s.11-1.3.31-1.9V7.03H3.06C2.38 8.41 2 9.96 2 11.79c0 1.83.38 3.38 1.06 4.76l3.38-2.86z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.83c1.47 0 2.79.51 3.83 1.5l2.88-2.88C16.96 2.94 14.7 2 12 2 8.04 2 4.7 4.17 3.06 7.03l3.38 2.86C7.22 7.57 9.42 5.83 12 5.83z"
        fill="#EA4335"
      />
    </svg>
  );
}
