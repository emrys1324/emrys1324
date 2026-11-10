"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, PageLoader, Toggle } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import type { Zone } from "@/lib/types";

export function ZonesAdmin() {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await getSupabase().from("delivery_zones").select("*").order("sort_order").order("name");
    if (error) return setError(error.message);
    setZones(data as Zone[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: string, p: Partial<Zone>) => {
    setZones((z) => z!.map((x) => (x.id === id ? { ...x, ...p } : x)));
    const { error } = await getSupabase().from("delivery_zones").update(p).eq("id", id);
    if (error) {
      setError(error.message);
      load();
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const { error } = await getSupabase()
      .from("delivery_zones")
      .insert({ name: name.trim(), fee: Number(fee) || 0, sort_order: (zones?.at(-1)?.sort_order ?? 0) + 1 });
    if (error) return setError(error.message.includes("duplicate") ? "That barangay already exists." : error.message);
    setName("");
    setFee("");
    load();
  };

  if (!zones) return error ? <Alert>{error}</Alert> : <PageLoader />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Delivery zones</h1>
        <p className="text-sm text-coffee-700">Barangays you deliver to and their fees. Switch a zone off to stop deliveries there (e.g. bad weather).</p>
      </div>
      {error && (
        <div onClick={() => setError(null)}>
          <Alert>{error} (tap to dismiss)</Alert>
        </div>
      )}
      <ul className="card divide-y divide-coffee-100 p-2">
        {zones.map((z) => (
          <li key={z.id} className="flex items-center gap-2 p-2">
            <input className="input flex-1" defaultValue={z.name} aria-label="Barangay" onBlur={(e) => e.target.value.trim() && e.target.value !== z.name && patch(z.id, { name: e.target.value.trim() })} />
            <div className="relative w-28">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-coffee-500">₱</span>
              <input
                type="number"
                min={0}
                className="input pl-7 text-right"
                defaultValue={z.fee}
                aria-label={`Fee for ${z.name}`}
                onBlur={(e) => Number(e.target.value) !== Number(z.fee) && patch(z.id, { fee: Math.max(0, Number(e.target.value) || 0) })}
              />
            </div>
            <Toggle checked={z.is_active} onChange={(v) => patch(z.id, { is_active: v })} label={`Deliver to ${z.name}`} />
            <button
              className="btn-ghost btn-sm px-2 text-red-700"
              aria-label={`Delete ${z.name}`}
              onClick={async () => {
                if (!confirm(`Delete ${z.name}?`)) return;
                const { error } = await getSupabase().from("delivery_zones").delete().eq("id", z.id);
                if (error) setError(error.message);
                load();
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="card flex flex-wrap gap-2 p-4">
        <input className="input min-w-[10rem] flex-1" placeholder="Barangay name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input w-28" type="number" min={0} placeholder="Fee ₱" value={fee} onChange={(e) => setFee(e.target.value)} />
        <button className="btn-primary">Add zone</button>
      </form>
    </div>
  );
}
