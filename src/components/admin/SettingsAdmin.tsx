"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, PageLoader, Spinner, Toggle } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { uploadPublicImage } from "@/lib/upload";
import { DEFAULT_LOGO, useStoreSettings } from "@/lib/store-settings";
import { BackgroundLayer } from "@/components/BrandBackground";
import { DEFAULT_STAFF_HEADER, headerTheme, isHex } from "@/lib/color";
import type { StoreSettings } from "@/lib/types";
import { TeamSection } from "./TeamAdmin";
import { useStaffAccess } from "./StaffAccess";

export function SettingsAdmin() {
  const { isAdmin } = useStaffAccess();
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
        store_name: s.store_name.trim() || "Pahuway Cafe",
        staff_title: (s.staff_title ?? "").trim() || "Pahuway Staff",
        header_color: isHex(s.header_color) ? s.header_color : null,
        staff_header_color: isHex(s.staff_header_color) ? s.staff_header_color : null,
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
        online_payments_enabled: !!s.online_payments_enabled,
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

        <OnlinePaymentsSection enabled={!!s.online_payments_enabled} onChange={(v) => set("online_payments_enabled", v)} />

        <section className="card space-y-4 p-5">
          <h2 className="section-title">{s.online_payments_enabled ? "Manual GCash (fallback)" : "GCash"}</h2>
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
                      set("gcash_qr_url", await uploadPublicImage(f, "gcash", { resize: false })); // never recompress a QR code
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

      {isAdmin && <TeamSection />}
    </div>
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
      const url = await uploadPublicImage(file, "branding", { maxDim: kind === "background" ? 2400 : 800 });
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
          <p className="absolute left-3 right-3 top-3 font-display text-lg font-bold leading-tight text-coffee-900">Slow down. Order Online</p>
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

      <HeaderSettings s={s} set={set} logo={logo} />

      <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-coffee-700">
        The icon on phones&apos; home screens (the Isla app icon) is set when the app is published to the stores and only changes with an app update.
      </p>
    </section>
  );
}

const SWATCHES = ["#fbf7f0", "#ffffff", "#efe4d8", "#432c1d", "#2e1e14", "#556c4d", "#435639", "#1e3a5f", "#7a2e2e", "#c2410c"];

function ColorField({ id, label, value, fallback, onChange }: { id: string; label: string; value: string | null; fallback: string; onChange: (v: string | null) => void }) {
  const current = isHex(value) ? value : fallback;
  const [text, setText] = useState(current);
  useEffect(() => setText(current), [current]);
  const theme = headerTheme(current);
  return (
    <div className="space-y-2">
      <span className="label" id={`${id}-label`}>
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby={`${id}-label`}>
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Use colour ${c}`}
            aria-pressed={current.toLowerCase() === c}
            onClick={() => onChange(c)}
            className={`h-9 w-9 rounded-full border-2 ${current.toLowerCase() === c ? "border-coffee-900 ring-2 ring-coffee-300" : "border-coffee-200"}`}
            style={{ background: c }}
          />
        ))}
        <label className="relative flex h-9 cursor-pointer items-center gap-2 rounded-full border border-coffee-200 bg-white pl-1 pr-3 text-sm font-semibold">
          <input type="color" value={current} onChange={(e) => onChange(e.target.value)} className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label={`${label}: custom colour`} />
          Custom
        </label>
        <input
          id={id}
          className="input h-9 min-h-0 w-28 rounded-full px-3 font-mono text-sm"
          value={text}
          maxLength={7}
          aria-label={`${label}: hex code`}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : "#" + e.target.value;
            setText(v);
            if (isHex(v)) onChange(v.toLowerCase());
          }}
        />
        {isHex(value) && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(null)}>
            Default
          </button>
        )}
      </div>
      {theme.ratio < 4.5 && (
        <p className="error-text" role="alert">
          This colour makes header text hard to read (contrast {theme.ratio.toFixed(1)}:1, minimum 4.5:1). Try a darker or lighter shade.
        </p>
      )}
    </div>
  );
}

function HeaderSettings({ s, set, logo }: { s: StoreSettings; set: SetFn; logo: string }) {
  const cust = isHex(s.header_color) ? headerTheme(s.header_color) : null;
  const staff = headerTheme(isHex(s.staff_header_color) ? s.staff_header_color : DEFAULT_STAFF_HEADER);
  const storeName = s.store_name?.trim() || "Pahuway Cafe";
  const staffTitle = s.staff_title?.trim() || "Pahuway Staff";
  return (
    <div className="space-y-6 border-t border-coffee-100 pt-5">
      {/* Customer header */}
      <div className="space-y-3">
        <p className="font-bold">Customer header</p>
        <div
          data-testid="customer-header-preview"
          className="flex items-center justify-between gap-3 rounded-2xl border border-coffee-200 px-4 py-3"
          style={{ background: cust?.bg ?? "#fbf7f0", color: cust?.fg ?? "#2e1e14" }}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-lg font-bold">{storeName}</span>
              <span className="block text-xs" style={{ color: cust?.muted ?? "#714a2f" }}>
                San Agustin, Romblon
              </span>
            </span>
          </span>
          <span className="rounded-full bg-sage-100 px-3 py-1 text-xs font-bold text-sage-700">Open</span>
        </div>
        <div>
          <label className="label" htmlFor="store-name">
            Store name (header title)
          </label>
          <input id="store-name" className="input" value={s.store_name ?? ""} maxLength={40} onChange={(e) => set("store_name", e.target.value)} placeholder="Pahuway Cafe" />
        </div>
        <ColorField id="header-color" label="Header colour" value={s.header_color} fallback="#fbf7f0" onChange={(v) => set("header_color", v)} />
      </div>

      {/* Staff header */}
      <div className="space-y-3">
        <p className="font-bold">Staff header</p>
        <div
          data-testid="staff-header-preview"
          className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
          style={{ background: staff.bg, color: staff.fg }}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-full bg-cream object-cover" />
            <span className="truncate font-display text-lg font-bold">{staffTitle}</span>
          </span>
          <span className="flex gap-1 text-sm font-semibold">
            <span className="rounded-lg px-2.5 py-1" style={{ background: staff.activeBg, color: staff.activeFg }}>
              Orders
            </span>
            <span className="rounded-lg px-2.5 py-1" style={{ color: staff.muted }}>
              Menu
            </span>
          </span>
        </div>
        <div>
          <label className="label" htmlFor="staff-title">
            Staff header title
          </label>
          <input id="staff-title" className="input" value={s.staff_title ?? ""} maxLength={40} onChange={(e) => set("staff_title", e.target.value)} placeholder="Pahuway Staff" />
        </div>
        <ColorField id="staff-color" label="Staff header colour" value={s.staff_header_color} fallback={DEFAULT_STAFF_HEADER} onChange={(v) => set("staff_header_color", v)} />
      </div>
    </div>
  );
}

function OnlinePaymentsSection({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  const [status, setStatus] = useState<{ configured: boolean; testMode: boolean; methods: string[] } | null>(null);
  useEffect(() => {
    fetch("/api/payments/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false, testMode: false, methods: [] }));
  }, []);
  const ready = !!status?.configured;
  return (
    <section className="card space-y-3 p-5" aria-labelledby="online-pay-title">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span id="online-pay-title" className="block font-bold">
            Online payments (HitPay)
          </span>
          <span className="text-sm text-coffee-700">Customers pay with GCash or QR Ph at checkout. Orders reach the board only after payment is confirmed.</span>
        </span>
        <Toggle checked={enabled && ready} onChange={onChange} disabled={!ready} label="Accept online payments" />
      </label>
      {status && !ready && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="payments-not-configured">
          Not set up yet: add your HitPay API key and salt to the website&apos;s server settings first (see docs/PAYMENTS.md). Until then customers can pay cash or manual GCash.
        </p>
      )}
      {ready && status?.testMode && (
        <p className="rounded-2xl bg-sky-100 px-4 py-3 text-sm text-sky-900">
          <strong>Test mode:</strong> HitPay sandbox is active, so no real money moves. Set HITPAY_ENV=live with your live keys before opening to customers.
        </p>
      )}
    </section>
  );
}
