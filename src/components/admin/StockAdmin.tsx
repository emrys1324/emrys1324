"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, PageLoader, Toggle } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import type { Category, ItemOption, MenuItem, OptionGroup } from "@/lib/types";

/** Quick sold-out / available switches — for every staff member (no prices or editing). */
export function StockAdmin() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [options, setOptions] = useState<ItemOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const db = getSupabase();
    const [c, i, g, o] = await Promise.all([
      db.from("menu_categories").select("*").order("sort_order"),
      db.from("menu_items").select("*").eq("is_active", true).order("sort_order"),
      db.from("option_groups").select("*").order("sort_order"),
      db.from("item_options").select("*").order("sort_order"),
    ]);
    setCats((c.data as Category[]) ?? []);
    setItems((i.data as MenuItem[]) ?? []);
    setGroups((g.data as OptionGroup[]) ?? []);
    setOptions((o.data as ItemOption[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, fn: string, args: Record<string, unknown>) => {
    setBusy(key);
    setError(null);
    const { error } = await getSupabase().rpc(fn, args);
    if (error) setError(error.message);
    await load();
    setBusy(null);
  };

  if (!cats) return <PageLoader />;
  const soldOut = items.filter((i) => i.is_sold_out).length;
  const off = options.filter((o) => !o.is_active).length;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Sold out</h1>
        <p className="text-coffee-700">
          Switch off anything you&apos;ve run out of — customers see it at once. {soldOut} item{soldOut === 1 ? "" : "s"} sold out · {off} option{off === 1 ? "" : "s"} off.
        </p>
      </div>
      {error && <Alert>{error}</Alert>}

      {cats.map((c) => {
        const list = items.filter((i) => i.category_id === c.id);
        if (!list.length) return null;
        return (
          <section key={c.id} className="card p-4">
            <h2 className="section-title mb-1">{c.name}</h2>
            <ul className="divide-y divide-coffee-100">
              {list.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className={`font-medium ${i.is_sold_out ? "text-coffee-500 line-through" : ""}`}>{i.name}</span>
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className={i.is_sold_out ? "text-red-700" : "text-sage-700"}>{i.is_sold_out ? "Sold out" : "Available"}</span>
                    <Toggle
                      checked={!i.is_sold_out}
                      disabled={busy === i.id}
                      label={`${i.name} available`}
                      onChange={(v) => run(i.id, "set_item_sold_out", { p_item: i.id, p_sold_out: !v })}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="card p-4">
        <h2 className="section-title mb-1">Options &amp; add-ons</h2>
        <p className="mb-2 text-sm text-coffee-700">E.g. switch off &ldquo;Oat milk&rdquo; when it runs out.</p>
        {groups.map((g) => {
          const list = options.filter((o) => o.group_id === g.id);
          if (!list.length) return null;
          return (
            <div key={g.id} className="mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-coffee-600">{g.name}</h3>
              <ul className="divide-y divide-coffee-100">
                {list.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                    <span className={o.is_active ? "" : "text-coffee-500 line-through"}>{o.name}</span>
                    <Toggle
                      checked={o.is_active}
                      disabled={busy === o.id}
                      label={`${g.name}: ${o.name} available`}
                      onChange={(v) => run(o.id, "set_option_available", { p_option: o.id, p_available: v })}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
