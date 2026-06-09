/**
 * Server-seitiges Auslesen der Session aus dem Cookie.
 * Wird in API-Routes und Server-Components benutzt.
 *
 * Alle exportierten Funktionen sind mit React.cache() gewrappt — sodass dieselbe
 * Funktion im selben Request nur einmal Cookie liest + DB anfragt, auch wenn
 * Layout + API-Route + Middleware sie alle aufrufen.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { COOKIE_NAME, isAuthConfigured, verifySession, type SessionPayload } from "./auth";
import { dbGetSetter } from "./db";
import type { SessionInfo } from "./types";

export const getServerSession = cache(async (): Promise<SessionPayload | null> => {
  if (!isAuthConfigured()) return null;
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  return await verifySession(value);
});

/** Setter-ID aus aktueller Session, oder null wenn nicht eingeloggt / Bootstrap-Admin. */
export const getCurrentSetterId = cache(async (): Promise<number | null> => {
  const session = await getServerSession();
  return session?.sid ?? null;
});

export const getSessionInfo = cache(async (): Promise<SessionInfo> => {
  // Ohne APP_SECRET = Dev-Modus: Middleware lässt alles durch, Sidebar soll
  // entsprechend auch alle Bereiche zeigen.
  if (!isAuthConfigured()) {
    return { setterId: null, setterName: null, setterColor: null, isAdmin: true };
  }
  const session = await getServerSession();
  if (!session) {
    return { setterId: null, setterName: null, setterColor: null, isAdmin: false };
  }
  if (session.sid) {
    const setter = await dbGetSetter(session.sid).catch(() => null);
    if (setter) {
      return {
        setterId: setter.id,
        setterName: setter.name,
        setterColor: setter.color,
        isAdmin: setter.isAdmin || session.adm === 1,
      };
    }
  }
  return {
    setterId: null,
    setterName: null,
    setterColor: null,
    isAdmin: session.adm === 1,
  };
});
