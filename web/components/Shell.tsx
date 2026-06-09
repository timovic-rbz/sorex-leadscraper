"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
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
    <div className="flex min-h-screen">
      <Sidebar session={session} />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
