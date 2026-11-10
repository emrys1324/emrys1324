"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, PageLoader, Spinner, Toggle } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { uploadPublicImage } from "@/lib/upload";
import type { Rider, StoreSettings } from "@/lib/types";

export function SettingsAdmin() {
  const [s, setS] = useState<StoreSettings | null>(null);
  const [msg, setMsg] = useState<{ tone: "red" | "green"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    getSupabase()
      .from("store_settings")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data, error }) => (error ? setMsg({ tone: "red", text: error.message }) : setS(data as StoreSettings)));
  }, []);

  if (!s) return msg ? <Alert>{msg.text}</Alert> : <PageLoader />;
  const set = <K extends keyof StoreSettings>(k: K, v: StoreSettings[K]) => setS({ ...s, [k]: v });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await getSupabase()
      .from("store_settings")
      .update({
        store_name: s.store_name,
        is_open: s.is_open,
        open_time: s.open_time,
        close_time: s.close_time,
        min_delivery_order: Number(s.min_delivery_order) || 0,
        prep_minutes: Math.min(120, Math.max(5, Number(s.prep_minutes) || 15)),
        closed_message: s.closed_message,
        gcash_name: s.gcash_name,
        gcash_number: s.gcash_number,
        gcash_qr_url: s.gcash_qr_url,
        contact_phone: s.contact_phone || null,
        contact_email: s.contact_email || null,
      })
      .eq("id", 1);
    setBusy(false);
    setMsg(error ? { tone: "red", text: error.message } : { tone: "green", text: "Settings saved." });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-2xl font-bold">Store settings</h1>
      <form onSubmit={save} className="space-y-4">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        <section className="card space-y-4 p-5">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-bold">Accepting orders</span>
              <span className="text-sm text-coffee-700">Turn off to close early (power outage, sold out, typhoon).</span>
            </span>
            <Toggle checked={s.is_open} onChange={(v) => set("is_open", v)} label="Accepting orders" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="open">
                Opens
              </label>
              <input id="open" type="time" className="input" value={s.open_time.slice(0, 5)} onChange={(e) => set("open_time", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="close">
                Closes
              </label>
              <input id="close" type="time" className="input" value={s.close_time.slice(0, 5)} onChange={(e) => set("close_time", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="c-phone">
                Café mobile (public)
              </label>
              <input id="c-phone" className="input" inputMode="numeric" value={s.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="c-email">
                Café email (public)
              </label>
              <input id="c-email" type="email" className="input" value={s.contact_email ?? ""} onChange={(e) => set("contact_email", e.target.value)} />
            </div>
          </div>
          <p className="hint -mt-2">Shown on the privacy policy page, which the app stores require.</p>
          <div>
            <label className="label" htmlFor="closed-msg">
              Message when closed
            </label>
            <input id="closed-msg" className="input" value={s.closed_message} onChange={(e) => set("closed_message", e.target.value)} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="min">
                Minimum for delivery (₱)
              </label>
              <input id="min" type="number" min={0} className="input" value={s.min_delivery_order} onChange={(e) => set("min_delivery_order", e.target.value as unknown as number)} />
            </div>
            <div>
              <label className="label" htmlFor="prep">
                Usual prep time (min)
              </label>
              <input id="prep" type="number" min={5} max={120} className="input" value={s.prep_minutes} onChange={(e) => set("prep_minutes", e.target.value as unknown as number)} />
            </div>
          </div>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="section-title">GCash</h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-coffee-200 bg-white">
              {s.gcash_qr_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.gcash_qr_url} alt="GCash QR" className="h-full w-full object-contain p-1" />
              ) : (
                <span className="p-3 text-center text-sm text-coffee-600">No QR yet</span>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <label className="btn-secondary btn-sm cursor-pointer">
                {uploading ? <Spinner /> : "Upload GCash QR"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setUploading(true);
                    try {
                      set("gcash_qr_url", await uploadPublicImage(f, "gcash"));
                      setMsg({ tone: "green", text: "QR uploaded — press Save settings to publish it." });
                    } catch (err) {
                      setMsg({ tone: "red", text: (err as Error).message });
                    }
                    setUploading(false);
                  }}
                />
              </label>
              <p className="hint">In GCash: Profile → My QR Codes → Download.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="gname">
                    Account name
                  </label>
                  <input id="gname" className="input" value={s.gcash_name ?? ""} onChange={(e) => set("gcash_name", e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="gnum">
                    GCash number
                  </label>
                  <input id="gnum" className="input" inputMode="numeric" value={s.gcash_number ?? ""} onChange={(e) => set("gcash_number", e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <button className="btn-primary w-full" disabled={busy || uploading}>
          {busy ? <Spinner /> : "Save settings"}
        </button>
      </form>

      <RidersSection />
    </div>
  );
}

function RidersSection() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "red" | "green"; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await getSupabase().from("riders").select("*").order("name");
    setRiders((data as Rider[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: string, p: Partial<Rider>) => {
    const { error } = await getSupabase().from("riders").update(p).eq("id", id);
    if (error) setMsg({ tone: "red", text: error.message });
    load();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/riders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ tone: "red", text: json.error ?? "Could not add rider." });
    setMsg({ tone: "green", text: `${form.name} can now sign in at /login with ${form.email}.` });
    setForm({ name: "", phone: "", email: "", password: "" });
    load();
  };

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="section-title">Riders</h2>
        <p className="text-sm text-coffee-700">Riders sign in at <span className="font-mono">/login</span> and only see deliveries assigned to them.</p>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <ul className="divide-y divide-coffee-100">
        {riders.map((r) => (
          <li key={r.id} className="flex items-center gap-2 py-2">
            <input className="input flex-1" defaultValue={r.name} aria-label="Rider name" onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && patch(r.id, { name: e.target.value.trim() })} />
            <input className="input w-40" defaultValue={r.phone ?? ""} aria-label="Rider mobile" onBlur={(e) => e.target.value !== (r.phone ?? "") && patch(r.id, { phone: e.target.value || null })} />
            <Toggle checked={r.is_active} onChange={(v) => patch(r.id, { is_active: v })} label={`${r.name} active`} />
          </li>
        ))}
        {riders.length === 0 && <li className="py-3 text-coffee-600">No riders yet.</li>}
      </ul>
      <form onSubmit={add} className="space-y-3 rounded-2xl bg-cream p-4">
        <p className="font-bold">Add a rider</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Name" />
          <input className="input" placeholder="Mobile 09XXXXXXXXX" inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-label="Mobile" />
          <input className="input" placeholder="Login email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-label="Login email" />
          <input className="input" placeholder="Password (8+ characters)" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} aria-label="Password" />
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner /> : "Create rider login"}
        </button>
      </form>
    </section>
  );
}
