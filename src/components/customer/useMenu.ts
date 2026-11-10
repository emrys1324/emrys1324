"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { Category, MenuItem, OptionGroup } from "@/lib/types";

export interface MenuData {
  categories: Category[];
  items: MenuItem[];
  groups: Record<string, OptionGroup>;
}

/** Loads the public menu and keeps it live (sold-out toggles appear instantly). */
export function useMenu() {
  const [data, setData] = useState<MenuData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    const [cats, items, groups] = await Promise.all([
      supabase.from("menu_categories").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("menu_items").select("*, menu_item_option_groups(group_id, sort_order)").eq("is_active", true).order("sort_order"),
      supabase.from("option_groups").select("*, item_options(*)").order("sort_order"),
    ]);
    const err = cats.error || items.error || groups.error;
    if (err) {
      setError(err.message);
      return;
    }
    const g: Record<string, OptionGroup> = {};
    for (const grp of (groups.data ?? []) as OptionGroup[]) {
      grp.item_options = (grp.item_options ?? []).filter((o) => o.is_active).sort((a, b) => a.sort_order - b.sort_order);
      g[grp.id] = grp;
    }
    setError(null);
    setData({ categories: cats.data as Category[], items: items.data as MenuItem[], groups: g });
  }, []);

  useEffect(() => {
    load();
    const supabase = getSupabase();
    const ch = supabase
      .channel("public-menu")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "menu_items" }, (p) => {
        const row = p.new as MenuItem;
        setData((d) => {
          if (!d) return d;
          if (!row.is_active) return { ...d, items: d.items.filter((i) => i.id !== row.id) };
          return { ...d, items: d.items.map((i) => (i.id === row.id ? { ...i, ...row, menu_item_option_groups: i.menu_item_option_groups } : i)) };
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "menu_items" }, () => load())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "menu_items" }, () => load())
      .subscribe();
    // Refresh when the tab comes back (phones suspend websockets in the background)
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      supabase.removeChannel(ch);
    };
  }, [load]);

  return { data, error, reload: load };
}
