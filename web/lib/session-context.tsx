"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SessionInfo } from "./types";

const EMPTY: SessionInfo = {
  setterId: null,
  setterName: null,
  setterColor: null,
  isAdmin: false,
};

const SessionContext = createContext<SessionInfo>(EMPTY);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionInfo;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Liefert die aktuelle Session aus dem Context. Wird im RootLayout serverseitig
 * gesetzt — kein /api/me-Roundtrip pro Page-Wechsel mehr nötig.
 */
export function useSession(): SessionInfo {
  return useContext(SessionContext);
}
