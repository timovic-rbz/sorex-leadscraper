import type { Metadata } from "next";
import "./globals.css";
import Shell from "@/components/Shell";
import { getSessionInfo } from "@/lib/session";

export const metadata: Metadata = {
  title: "Lead Scraper",
  description: "Google Places + Cold-Calling-CRM",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionInfo();

  return (
    <html lang="de">
      <body className="min-h-screen">
        <Shell session={session}>{children}</Shell>
      </body>
    </html>
  );
}
