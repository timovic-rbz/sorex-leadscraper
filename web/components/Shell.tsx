"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import { PhoneSearchTrigger } from "./PhoneSearchTrigger";
import { SessionProvider } from "@/lib/session-context";
import type { SessionInfo } from "@/lib/types";

export default function Shell({
  session,
  children,
}: {
  session: SessionInfo;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLogin = pathname?.startsWith("/login") ?? false;

  if (isLogin) return <main className="min-h-screen">{children}</main>;

  return (
    <SessionProvider value={session}>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar session={session} />
        {/* pb-24 schafft Platz für die fixe Bottom-Nav auf mobile (60px Nav + Safe-Area) */}
        <main className="flex-1 overflow-x-hidden pb-24 lg:pb-0">{children}</main>
      </div>
      <PhoneSearchTrigger />
    </SessionProvider>
  );
}
