"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, PageLoader, Spinner, Toggle } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { uploadPublicImage } from "@/lib/upload";
import { DEFAULT_LOGO, useStoreSettings } from "@/lib/store-settings";
import { BackgroundLayer } from "@/components/BrandBackground";
import type { Rider, StoreSettings } from "@/lib/types";

export function SettingsAdmin() {
  const { setLocal } = useStoreSettings();
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
        logo_url: s.logo_url || null,
        background_url: s.background_url || null,
        background_fade: Math.min(95, Math.max(40, Number(s.background_fade) || 85)),
      })
      .eq("id", 1);
    setBusy(false);
    if (!error) setLocal(s); // update header/logo here immediately; other screens update via realtime
    setMsg(error ? { tone: "red", text: error.message } : { tone: "green", text: "Settings saved." });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-2xl font-bold">Store settings</h1>
      <form onSubmit={save} className="space-y-4">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        <BrandingSection s={s} set={set} setMsg={setMsg} uploading={uploading} setUploading={setUploading} />

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

type SetFn = <K extends keyof StoreSettings>(k: K, v: StoreSettings[K]) => void;

/** Reads an image file and returns its pixel size (for friendly warnings). */
function imageSize(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function BrandingSection({
  s,
  set,
  setMsg,
  uploading,
  setUploading,
}: {
  s: StoreSettings;
  set: SetFn;
  setMsg: (m: { tone: "red" | "green"; text: string } | null) => void;
  uploading: boolean;
  setUploading: (v: boolean) => void;
}) {
  const upload = async (file: File | undefined, kind: "logo" | "background") => {
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const size = await imageSize(file);
      if (!size) throw new Error("That file doesn't look like an image. Please use JPG, PNG or WebP.");
      if (kind === "logo" && Math.min(size.w, size.h) < 128) throw new Error("Logo is too small — please use at least 256 × 256 pixels.");
      if (kind === "background" && Math.max(size.w, size.h) < 1000) throw new Error("Background is too small — please use at least 1600 pixels wide so it stays sharp.");
      const url = await uploadPublicImage(file, "branding");
      set(kind === "logo" ? "logo_url" : "background_url", url);
      const squareNote = kind === "logo" && Math.abs(size.w - size.h) > Math.min(size.w, size.h) * 0.1 ? " Tip: a square logo looks best — it's shown in a circle." : "";
      setMsg({ tone: "green", text: `${kind === "logo" ? "Logo" : "Background"} uploaded — press Save settings to publish it.${squareNote}` });
    } catch (err) {
      setMsg({ tone: "red", text: (err as Error).message });
    }
    setUploading(false);
  };

  const logo = s.logo_url || DEFAULT_LOGO;
  const fade = s.background_fade ?? 85;

  return (
    <section className="card space-y-5 p-5" aria-labelledby="branding-title">
      <div>
        <h2 id="branding-title" className="section-title">
          Branding
        </h2>
        <p className="text-sm text-coffee-700">Your logo and background appear on the website and inside the Isla app as soon as you save.</p>
      </div>

      {/* Logo */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="Current logo" className="h-24 w-24 shrink-0 rounded-full border border-coffee-200 bg-white object-cover" data-testid="logo-preview" />
        <div className="flex-1 space-y-2">
          <p className="font-bold">Logo</p>
          <div className="flex flex-wrap gap-2">
            <label className="btn-secondary btn-sm cursor-pointer">
              {uploading ? <Spinner /> : s.logo_url ? "Change logo" : "Upload logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Upload logo" onChange={(e) => upload(e.target.files?.[0], "logo")} />
            </label>
            {s.logo_url && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => set("logo_url", null)}>
                Use default logo
              </button>
            )}
          </div>
          <p className="hint">Square image, at least 256 × 256 px (PNG with a transparent or solid background works best). Max 5 MB.</p>
        </div>
      </div>

      {/* Background */}
      <div className="space-y-3">
        <p className="font-bold">Background image</p>
        <div className="relative isolate h-44 overflow-hidden rounded-2xl border border-coffee-200 bg-cream" data-testid="background-preview">
          {s.background_url ? (
            <BackgroundLayer url={s.background_url} fade={fade} fixed={false} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-coffee-600">No background — plain cream</div>
          )}
          {/* sample content so you can judge readability */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3 rounded-2xl bg-white p-3 shadow-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" className="h-10 w-10 rounded-full object-cover" />
            <div className="flex-1">
              <p className="font-bold leading-tight">Café Latte</p>
              <p className="text-sm text-coffee-700">Preview of a menu card</p>
            </div>
            <span className="font-bold">₱150</span>
          </div>
          <p className="absolute left-3 top-3 font-display text-2xl font-bold text-coffee-900">Slow down. Sip.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="btn-secondary btn-sm cursor-pointer">
            {uploading ? <Spinner /> : s.background_url ? "Change background" : "Upload background"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Upload background" onChange={(e) => upload(e.target.files?.[0], "background")} />
          </label>
          {s.background_url && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => set("background_url", null)}>
              Remove background
            </button>
          )}
        </div>
        {s.background_url && (
          <div>
            <label className="label" htmlFor="fade">
              Fade: {fade}% <span className="font-normal text-coffee-600">(higher = softer photo, easier to read)</span>
            </label>
            <input
              id="fade"
              type="range"
              min={40}
              max={95}
              step={5}
              value={fade}
              onChange={(e) => set("background_fade", Number(e.target.value))}
              className="w-full accent-coffee-700"
            />
          </div>
        )}
        <p className="hint">Landscape photo, at least 1600 px wide (e.g. your café interior or a coffee close-up). Shown behind customer pages only, not the staff screens. Max 5 MB.</p>
      </div>

      <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-coffee-700">
        The icon on phones&apos; home screens (the Isla app icon) is set when the app is published to the stores and only changes with an app update.
      </p>
    </section>
  );
}
