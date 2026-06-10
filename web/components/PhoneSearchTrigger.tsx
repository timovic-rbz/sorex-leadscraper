"use client";

import { useEffect, useState } from "react";
import { PhoneSearchModal } from "./PhoneSearchModal";

/**
 * Globale Telefonnummer-Suche. Wird einmal im Shell montiert und kann von
 * überall geöffnet werden:
 *   - Cmd/Ctrl + K
 *   - Cmd/Ctrl + F (häufig erwartet von Sales-Tools)
 *   - Klick auf die Trigger-Buttons in Sidebar/TopBar
 *
 * State liegt in einem globalen Custom-Event-Listener, sodass die Trigger-
 * Komponenten in Sidebar.tsx einfach `window.dispatchEvent(new Event(...))`
 * machen können, ohne dass wir Context oder Lifting brauchen.
 */
const OPEN_EVENT = "open-phone-search";

export function openPhoneSearch() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function PhoneSearchTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return <PhoneSearchModal open={open} onClose={() => setOpen(false)} />;
}
