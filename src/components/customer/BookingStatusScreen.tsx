"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StoreHeader } from "./Header";
import { Alert, Badge, PageLoader } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { formatPeso } from "@/lib/format";
import { useStoreSettings } from "@/lib/store-settings";
import { BOOKING_STATUS_LABEL, prettyDateTime, useRentalSettings, type BookingStatus } from "@/lib/rentals";

interface PublicBooking {
  booking_number: string;
  status: BookingStatus;
  payment_status: string;
  payment_method: string | null;
  gcash_reference: string | null;
  scooter_name: string;
  customer_name: string;
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
  cancel_reason: string | null;
}

/** A customer's booking, by its secret link. Shows whether staff have checked the GCash deposit yet. */
export function BookingStatusScreen({ token }: { token: string }) {
  const { settings, open } = useStoreSettings();
  const rs = useRentalSettings();
  const [b, setB] = useState<PublicBooking | null | undefined>(undefined);

  const load = useCallback(async () => {
    const { data } = await getSupabase().rpc("get_booking_by_token", { p_token: token });
    setB((data as PublicBooking) ?? null);
  }, [token]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 15000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

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

  const paid = ["deposit_paid", "paid"].includes(b.payment_status);
  const checking = b.payment_status === "for_verification" && b.status === "awaiting_deposit";
  const label = checking ? "Checking your GCash payment" : BOOKING_STATUS_LABEL[b.status];

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
            <Badge tone={b.status === "cancelled" ? "red" : b.status === "awaiting_deposit" ? "amber" : "green"}>{label}</Badge>
          </p>
          {b.status === "confirmed" && <p className="mt-3 text-lg font-semibold text-sage-700">You&apos;re booked! Deposit received ✓</p>}
          {b.status === "picked_up" && <p className="mt-3 text-lg">Enjoy the ride! 🛵</p>}
          {b.status === "returned" && <p className="mt-3 text-lg">Thanks for riding with us!</p>}
        </section>

        {checking && (
          <Alert tone="amber">
            <p className="text-base font-bold">We&apos;re checking your GCash payment</p>
            <p className="font-normal">
              Your scooter is held for you while our staff confirm your {formatPeso(b.deposit_amount)} deposit
              {b.gcash_reference ? ` (ref. ${b.gcash_reference})` : ""}. This page updates by itself once it&apos;s confirmed.
            </p>
          </Alert>
        )}
        {b.status === "cancelled" && (
          <Alert>
            <p className="font-bold">This booking is cancelled.</p>
            {b.cancel_reason && <p className="font-normal">{b.cancel_reason}</p>}
            {b.payment_status === "refunded" && <p className="font-normal">Your deposit has been sent back to you.</p>}
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
              <dt>Deposit {paid ? "paid" : b.payment_method === "gcash" ? "sent by GCash (being checked)" : "(not paid)"}</dt>
              <dd>{formatPeso(b.deposit_amount)}</dd>
            </div>
            {b.status !== "cancelled" && (
              <div className="flex justify-between font-semibold">
                <dt>Balance at pickup</dt>
                <dd data-testid="balance">{formatPeso(Number(b.total) - Number(b.deposit_amount))}</dd>
              </div>
            )}
          </dl>
          {Number(b.security_deposit) > 0 && b.status !== "cancelled" && b.status !== "returned" && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">
              Bring a {formatPeso(b.security_deposit)} security deposit at pickup{rs?.security_deposit_note ? ` (${rs.security_deposit_note})` : ""} — returned when the scooter comes back in good condition.
            </p>
          )}
          {b.status !== "cancelled" && b.status !== "returned" && <p className="text-coffee-700">Bring your driver&apos;s license when you pick up the scooter.</p>}
        </section>
        <p className="text-center text-sm text-coffee-700">Save this page — it&apos;s your booking link.</p>
        <Link href="/" className="btn-secondary w-full">
          Back to home
        </Link>
      </main>
    </div>
  );
}
