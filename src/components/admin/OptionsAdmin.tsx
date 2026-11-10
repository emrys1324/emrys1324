"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, PageLoader, Toggle } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import type { ItemOption, OptionGroup } from "@/lib/types";

export function OptionsAdmin() {
  const [groups, setGroups] = useState<OptionGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await getSupabase().from("option_groups").select("*, item_options(*)").order("sort_order");
    if (error) return setError(error.message);
    setGroups(
      (data as OptionGroup[]).map((g) => ({ ...g, item_options: (g.item_options ?? []).sort((a, b) => a.sort_order - b.sort_order) })),
    );
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (p: PromiseLike<{ error: { message: string } | null }>, reload = false) => {
    const { error } = await p;
    if (error) setError(error.message);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
    if (reload || error) load();
  };
  const s = () => getSupabase();

  if (!groups) return error ? <Alert>{error}</Alert> : <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold">Options</h1>
          <p className="text-sm text-coffee-700">Choices like hot/iced, sugar level and add-ons. Changes save automatically.</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm font-semibold text-sage-700">Saved ✓</span>}
          <button
            className="btn-primary"
            onClick={() => run(s().from("option_groups").insert({ name: "New group", sort_order: (groups.at(-1)?.sort_order ?? 0) + 1 }), true)}
          >
            + Add group
          </button>
        </div>
      </div>
      {error && (
        <div onClick={() => setError(null)}>
          <Alert>{error} (tap to dismiss)</Alert>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((g) => (
          <section key={g.id} className="card space-y-3 p-4">
            <div className="flex items-center gap-2">
              <input
                className="input flex-1 font-bold"
                defaultValue={g.name}
                aria-label="Group name"
                onBlur={(e) => e.target.value.trim() && e.target.value !== g.name && run(s().from("option_groups").update({ name: e.target.value.trim() }).eq("id", g.id))}
              />
              <button
                className="btn-ghost btn-sm text-red-700"
                onClick={() => confirm(`Delete "${g.name}" and its choices? It will be removed from all items.`) && run(s().from("option_groups").delete().eq("id", g.id), true)}
              >
                Delete
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <select
                className="input w-auto"
                value={g.selection}
                aria-label="Selection type"
                onChange={(e) => run(s().from("option_groups").update({ selection: e.target.value }).eq("id", g.id), true)}
              >
                <option value="single">Pick one</option>
                <option value="multi">Pick many</option>
              </select>
              <label className="flex items-center gap-2 font-semibold">
                <Toggle checked={g.is_required} onChange={(v) => run(s().from("option_groups").update({ is_required: v }).eq("id", g.id), true)} label="Required" />
                Required
              </label>
              {g.selection === "multi" && (
                <label className="flex items-center gap-2 font-semibold">
                  Max
                  <input
                    type="number"
                    min={1}
                    className="input w-20 text-center"
                    defaultValue={g.max_select ?? ""}
                    placeholder="∞"
                    onBlur={(e) => run(s().from("option_groups").update({ max_select: e.target.value ? Number(e.target.value) : null }).eq("id", g.id))}
                  />
                </label>
              )}
            </div>

            <ul className="space-y-2">
              {(g.item_options ?? []).map((o: ItemOption) => (
                <li key={o.id} className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    defaultValue={o.name}
                    aria-label="Choice name"
                    onBlur={(e) => e.target.value.trim() && e.target.value !== o.name && run(s().from("item_options").update({ name: e.target.value.trim() }).eq("id", o.id))}
                  />
                  <div className="relative w-24">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-coffee-500">+₱</span>
                    <input
                      type="number"
                      className="input pl-8 text-right"
                      defaultValue={o.price_delta}
                      aria-label="Extra price"
                      onBlur={(e) => Number(e.target.value) !== Number(o.price_delta) && run(s().from("item_options").update({ price_delta: Number(e.target.value) || 0 }).eq("id", o.id))}
                    />
                  </div>
                  <button
                    title="Default choice"
                    aria-label={`Make ${o.name} the default`}
                    aria-pressed={o.is_default}
                    className={`btn-sm h-10 w-10 rounded-xl border text-lg ${o.is_default ? "border-amber-500 bg-amber-100" : "border-coffee-200 bg-white text-coffee-400"}`}
                    onClick={async () => {
                      if (g.selection === "single" && !o.is_default) await s().from("item_options").update({ is_default: false }).eq("group_id", g.id);
                      run(s().from("item_options").update({ is_default: !o.is_default }).eq("id", o.id), true);
                    }}
                  >
                    ★
                  </button>
                  <Toggle checked={o.is_active} onChange={(v) => run(s().from("item_options").update({ is_active: v }).eq("id", o.id), true)} label={`${o.name} available`} />
                  <button className="btn-ghost btn-sm px-2 text-red-700" aria-label={`Delete ${o.name}`} onClick={() => run(s().from("item_options").delete().eq("id", o.id), true)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <button
              className="btn-secondary btn-sm"
              onClick={() =>
                run(s().from("item_options").insert({ group_id: g.id, name: "New choice", price_delta: 0, sort_order: (g.item_options?.at(-1)?.sort_order ?? 0) + 1 }), true)
              }
            >
              + Add choice
            </button>
          </section>
        ))}
      </div>
      <p className="text-sm text-coffee-600">★ = pre-selected for customers. The switch turns a choice off without deleting it (e.g. oat milk ran out).</p>
    </div>
  );
}
