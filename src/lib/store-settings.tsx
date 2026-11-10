"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { getSupabase } from "./supabase/client";
import { isStoreOpen } from "./hours";
import type { StoreSettings } from "./types";

export const DEFAULT_LOGO = "/logo.svg";

interface Ctx {
  settings: StoreSettings | null;
  setLocal: (patch: Partial<StoreSettings>) => void;
}
const StoreSettingsContext = createContext<Ctx>({ settings: null, setLocal: () => {} });

/**
 * Loads store settings once for the whole site and keeps them live over one
 * realtime channel (open/closed, hours, logo, background…).
 */
export function StoreSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<StoreSettings | null>(null);

  useEffect(() => {
    let supabase: ReturnType<typeof getSupabase>;
    try {
      supabase = getSupabase();
    } catch {
      return; // env not configured (e.g. build preview)
    }
    let active = true;
    const load = () =>
      supabase
        .from("store_settings")
        .select("*")
        .eq("id", 1)
        .single()
        .then(({ data }) => active && data && setSettings(data as StoreSettings));
    load();
    const ch = supabase
      .channel("store-settings")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "store_settings" }, (p) => setSettings(p.new as StoreSettings))
      .subscribe();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVis);
      supabase.removeChannel(ch);
    };
  }, []);

  const setLocal = (patch: Partial<StoreSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));
  return <StoreSettingsContext.Provider value={{ settings, setLocal }}>{children}</StoreSettingsContext.Provider>;
}

/** Live store settings + an "open now" flag that re-evaluates every 30s. */
export function useStoreSettings() {
  const { settings, setLocal } = useContext(StoreSettingsContext);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  return { settings, open: isStoreOpen(settings), setLocal };
}

/** Current logo URL (custom upload or the bundled default). */
export function useLogo(): string {
  const { settings } = useContext(StoreSettingsContext);
  return settings?.logo_url || DEFAULT_LOGO;
}
