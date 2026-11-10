"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "./supabase/client";
import { isStoreOpen } from "./hours";
import type { StoreSettings } from "./types";

/** Live store settings + an "open now" flag that re-evaluates every 30s. */
export function useStoreSettings() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;
    supabase
      .from("store_settings")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data }) => active && data && setSettings(data as StoreSettings));
    const ch = supabase
      .channel("store-settings")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "store_settings" }, (p) =>
        setSettings(p.new as StoreSettings),
      )
      .subscribe();
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      active = false;
      clearInterval(t);
      supabase.removeChannel(ch);
    };
  }, []);

  return { settings, open: isStoreOpen(settings) };
}
