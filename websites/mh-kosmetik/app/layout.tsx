import type { Metadata } from "next";
import { Playfair_Display, Lato } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-playfair",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-lato",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MH Kosmetik · Kosmetikstudio Langenfeld – Mit Liebe. Für Ihre Schönheit.",
  description:
    "Kosmetikstudio in Langenfeld für Gesichtsbehandlungen, dauerhafte Haarentfernung und Maniküre. Hochwertige Pflege, sichtbare Ergebnisse, persönliche Beratung.",
  metadataBase: new URL("https://mhkosmetik.de"),
  openGraph: {
    title: "MH Kosmetik · Langenfeld",
    description:
      "Strahlende Schönheit, die von Herzen kommt – Ihr System für zeitlose Eleganz in Langenfeld.",
    type: "website",
    locale: "de_DE",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${playfair.variable} ${lato.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
