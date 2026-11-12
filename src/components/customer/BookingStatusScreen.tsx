"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { StoreHeader } from "./Header";
import { Alert, Badge, PageLoader, Spinner } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { formatPeso } from "@/lib/format";
import { useStoreSettings } from "@/lib/store-settings";
import { BOOKING_STATUS_LABEL, prettyDateTime, useRentalSettings, type BookingStatus } from "@/lib/rentals";

interface PublicBooking {
  booking_number: string;
  status: BookingStatus;
  payment_status: string;
  scooter_name: string;
  customer_name: string;
  start_date: string;
  end_date: string;
  pickup_at: string;
  return_at: string;
  days: number;
  daily_rate: number;
  helmets: number;
  delivery: boolean;
  delivery_address: string | null;
  delivery_fee: number;
  total: number;
  deposit_amount: number;
  security_deposit: number;
  checkout_url: string | null;
  payment_expires_at: string | null;
  cancel_reason: string | null;
}

/** A customer's booking, by its secret link. Confirms the deposit with HitPay when they return from paying. */
export function BookingStatusScreen({ token }: { token: string }) {
  const { settings, open } = useStoreSettings();
  const rs = useRentalSettings();
  const params = useSearchParams();
  const [b, setB] = useState<PublicBooking | null | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const { data } = await getSupabase().rpc("get_booking_by_token", { p_token: token });
    setB((data as PublicBooking) ?? null);
    return data as PublicBooking | null;
  }, [token]);

  useEffect(() => {
    let stop = false;
    (async () => {
      const first = await load();
      // back from HitPay: confirm with HitPay (webhook may be a few seconds behind)
      if (params.get("paid") && first?.payment_status === "awaiting_payment") {
        setChecking(true);
        // HitPay adds status=completed when the payment went through; otherwise (customer backed out) check briefly
        const tries = params.get("status") === "completed" ? 10 : 2;
        for (let i = 0; i < tries && !stop; i++) {
          const r = await fetch("/api/rentals/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).then((x) => x.json()).catch(() => ({}));
          const next = await load();
          if (r.outcome === "paid" || r.outcome === "already_paid" || next?.payment_status !== "awaiting_payment") break;
          if (i < tries - 1) await new Promise((res) => setTimeout(res, 3000));
        }
        setChecking(false);
      }
    })();
    const t = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(load, 20000);
    return () => {
      stop = true;
      clearInterval(t);
      clearInterval(poll);
    };
  }, [load, params, token]);

  const payNow = async () => {
    setPaying(true);
    setError(null);
    const res = await fetch("/api/rentals/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.url) {
      window.location.href = j.url;
      return;
    }
    setError(j.error ?? "We couldn't open the payment page. Please try again.");
    setPaying(false);
    load();
  };

  if (b === undefined) return <PageLoader />;
  const header = <StoreHeader settings={settings} open={open} brand="baybayin" back="/baybayin" />;
  if (!b)
    return (
      <div className="min-h-screen">
        {header}
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-2xl font-bold">Booking not found</h1>
          <p className="mt-2 text-coffee-700">Please check the link.</p>
          <Link href="/baybayin" className="btn-primary mt-6">
            Book a scooter
          </Link>
        </main>
      </div>
    );

  const left = b.payment_expires_at ? Math.max(0, new Date(b.payment_expires_at).getTime() - now) : 0;
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  const paid = ["deposit_paid", "paid"].includes(b.payment_status);
  const balance = Number(b.total) - (paid ? Number(b.deposit_amount) : 0);

  return (
    <div className="min-h-screen">
      {header}
      <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <section className="card p-5 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-coffee-600">Booking</p>
          <p className="font-display text-4xl font-bold" data-testid="booking-number">
            {b.booking_number}
          </p>
          <p className="mt-2">
            <Badge tone={b.status === "cancelled" ? "red" : b.status === "awaiting_deposit" ? "amber" : "green"}>{BOOKING_STATUS_LABEL[b.status]}</Badge>
          </p>
          {checking && (
            <p className="mt-3 flex items-center justify-center gap-2 text-coffee-700">
              <Spinner /> Confirming your payment…
            </p>
          )}
          {b.status === "confirmed" && <p className="mt-3 text-lg font-semibold text-sage-700">You&apos;re booked! Deposit received ✓</p>}
          {b.status === "picked_up" && <p className="mt-3 text-lg">Enjoy the ride! 🛵</p>}
          {b.status === "returned" && <p className="mt-3 text-lg">Thanks for riding with us!</p>}
        </section>

        {b.status === "awaiting_deposit" && !checking && (
          <section className="card space-y-3 p-5">
            <Alert tone="amber">
              <p className="text-base font-bold">Complete your deposit</p>
              <p className="font-normal">
                Pay {formatPeso(b.deposit_amount)} within {mm}:{String(ss).padStart(2, "0")} to keep this booking. After that, the scooter is released for others.
              </p>
            </Alert>
            <button className="btn-primary w-full" onClick={payNow} disabled={paying || left === 0}>
              {paying ? <Spinner /> : `Pay ${formatPeso(b.deposit_amount)} now`}
            </button>
            {error && <Alert>{error}</Alert>}
          </section>
        )}
        {b.status === "cancelled" && (
          <Alert>
            <p className="font-bold">This booking is cancelled.</p>
            {b.cancel_reason && <p className="font-normal">{b.cancel_reason}</p>}
            {b.payment_status === "refunded" && <p className="font-normal">Your deposit has been refunded.</p>}
          </Alert>
        )}

        <section className="card space-y-2 p-5 text-sm">
          <h2 className="section-title mb-1">Details</h2>
          <p>
            <strong>{b.scooter_name}</strong> · {b.helmets === 0 ? "no helmet" : `${b.helmets} helmet${b.helmets > 1 ? "s" : ""}`}
          </p>
          <p data-testid="booking-times">
            <strong>Pickup:</strong> {prettyDateTime(b.pickup_at)}
            <br />
            <strong>Return by:</strong> {prettyDateTime(b.return_at)} · {b.days} day{b.days === 1 ? "" : "s"}
          </p>
          <p>{b.delivery ? `Delivery to: ${b.delivery_address}` : `Pickup${rs?.pickup_note ? `: ${rs.pickup_note}` : ""}`}</p>
          <dl className="space-y-1 border-t border-coffee-100 pt-2">
            <div className="flex justify-between">
              <dt>
                {b.days} × {formatPeso(b.daily_rate)}
              </dt>
              <dd>{formatPeso(b.days * Number(b.daily_rate))}</dd>
            </div>
            {b.delivery && (
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd>{formatPeso(b.delivery_fee)}</dd>
              </div>
            )}
            <div className="flex justify-between font-bold">
              <dt>Total</dt>
              <dd>{formatPeso(b.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Deposit {paid ? "paid online" : "(due now)"}</dt>
              <dd>{formatPeso(b.deposit_amount)}</dd>
            </div>
            {b.status !== "cancelled" && (
              <div className="flex justify-between font-semibold">
                <dt>{paid ? "Balance at pickup" : "Balance after deposit"}</dt>
                <dd data-testid="balance">{formatPeso(paid ? balance : Number(b.total) - Number(b.deposit_amount))}</dd>
              </div>
            )}
          </dl>
          {Number(b.security_deposit) > 0 && b.status !== "cancelled" && b.status !== "returned" && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">
              Bring a {formatPeso(b.security_deposit)} security deposit at pickup{rs?.security_deposit_note ? ` (${rs.security_deposit_note})` : ""} — returned when the scooter comes back in good condition. Bring your driver&apos;s license too.
            </p>
          )}
        </section>
        <p className="text-center text-sm text-coffee-700">Save this page — it&apos;s your booking link.</p>
        <Link href="/" className="btn-secondary w-full">
          Back to home
        </Link>
      </main>
    </div>
  );
}
