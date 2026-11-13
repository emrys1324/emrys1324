"use client";
import { useEffect, useState } from "react";
import { Alert, Spinner } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { formatPeso } from "@/lib/format";
import { resizeImage } from "@/lib/upload";
import { useStoreSettings } from "@/lib/store-settings";

/**
 * "Can't pay online? Pay by GCash instead": shows the café's GCash details, takes the payment screenshot,
 * and asks the server to switch the order/booking to manual GCash (staff then verify it).
 */
export function GcashFallback({ token, amount, folder, endpoint, onDone }: { token: string; amount: number; folder: "proofs" | "proofs/rentals"; endpoint: string; onDone: () => void }) {
  const { settings } = useStoreSettings();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const send = async () => {
    setError(null);
    if (!file) return setError("Please attach a screenshot of your GCash payment.");
    if (file.size > 8 * 1024 * 1024) return setError("Screenshot is too large (max 8 MB).");
    setBusy(true);
    try {
      const blob = await resizeImage(file, 1600);
      const ext = blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const day = new Date().toISOString().slice(0, 10);
      const path = `${folder}/${day}/${crypto.randomUUID()}.${ext}`;
      const up = await getSupabase().storage.from("payment-proofs").upload(path, blob, { contentType: blob.type || file.type, upsert: false });
      if (up.error) throw new Error("We couldn't upload your screenshot. Please try again.");
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, proof_path: path }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Couldn't switch to GCash. Please try again.");
      if (j.paid) setInfo("Good news — your online payment went through after all, so there's no need to send GCash.");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  if (info) return <Alert tone="green">{info}</Alert>;
  if (!open)
    return (
      <button type="button" className="btn-ghost w-full text-sm underline underline-offset-2" onClick={() => setOpen(true)} data-testid="gcash-fallback-open">
        Can&apos;t pay online? Pay by GCash instead
      </button>
    );
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 text-left" data-testid="gcash-fallback">
      <p className="font-bold">Pay by GCash instead</p>
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
        {settings?.gcash_qr_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={settings.gcash_qr_url} alt="GCash QR code" className="h-40 w-40 rounded-2xl bg-white p-2 ring-1 ring-coffee-100" />
        ) : null}
        <div>
          <p className="text-sm text-coffee-700">Send exactly</p>
          <p className="text-2xl font-bold tabular-nums" data-testid="gcash-fallback-amount">
            {formatPeso(amount)}
          </p>
          {settings?.gcash_name && <p className="font-semibold">{settings.gcash_name}</p>}
          {settings?.gcash_number && <p className="font-mono">{settings.gcash_number}</p>}
        </div>
      </div>
      <label className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-coffee-300 bg-white px-4 py-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Payment screenshot preview" className="h-14 w-10 rounded-lg object-cover" />
        ) : (
          <span className="text-2xl" aria-hidden>
            📎
          </span>
        )}
        <span className="font-semibold text-coffee-800">{file ? "Change screenshot" : "Attach GCash screenshot"}</span>
        <input type="file" accept="image/*" className="sr-only" aria-label="GCash payment screenshot" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1" onClick={send} disabled={busy}>
          {busy ? <Spinner /> : "Send GCash screenshot"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={busy}>
          Back
        </button>
      </div>
      <p className="text-xs text-coffee-600">Don&apos;t pay twice: use this only if your online payment didn&apos;t go through. Our staff will check your GCash payment and confirm.</p>
    </div>
  );
}
