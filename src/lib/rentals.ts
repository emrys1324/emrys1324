"use client";
// Baybayin scooter rentals — shared types and helpers for customer and staff screens.
import { useEffect, useState } from "react";
import { getSupabase } from "./supabase/client";

export interface RentalSettings {
  bookings_enabled: boolean;
  deposit_percent: number;
  security_deposit: number;
  security_deposit_note: string | null;
  delivery_fee: number;
  pickup_note: string | null;
  max_days: number;
  grace_minutes: number;
  turnaround_minutes: number;
  terms: string | null;
  online_enabled: boolean;
  terms_updated_at: string | null;
  sms_enabled: boolean;
  staff_alert_phones: string | null;
  reminder_hours: number;
}
export interface Scooter {
  id: string;
  name: string;
  description: string | null;
  daily_rate: number;
  photo_url: string | null;
  is_active: boolean;
  sort_order: number;
}
export type BookingStatus = "awaiting_deposit" | "confirmed" | "picked_up" | "returned" | "cancelled";
export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  awaiting_deposit: "Checking deposit",
  confirmed: "Confirmed",
  picked_up: "On the road",
  returned: "Returned",
  cancelled: "Cancelled",
};
export const PAYMENT_LABEL: Record<string, string> = {
  awaiting_payment: "Deposit not paid",
  for_verification: "GCash to check",
  deposit_paid: "Deposit paid",
  paid: "Paid in full",
  refunded: "Deposit refunded",
};

/** Rental settings (public), live. */
export function useRentalSettings() {
  const [s, setS] = useState<RentalSettings | null>(null);
  useEffect(() => {
    const db = getSupabase();
    let active = true;
    db.from("rental_settings").select("*").eq("id", 1).single().then(({ data }) => active && data && setS(data as RentalSettings));
    const ch = db
      .channel("rental-settings")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rental_settings" }, (p) => setS(p.new as RentalSettings))
      .subscribe();
    return () => {
      active = false;
      db.removeChannel(ch);
    };
  }, []);
  return s;
}

/** "YYYY-MM-DD" for a date in Manila. */
export function manilaDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export const addDays = (ymd: string, n: number) => {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Rental days: return day − pickup day, minimum 1 (same-day = 1 day). */
export const rentalDays = (start: string, end: string) => Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000));
/** Last day a booking occupies (the return day itself is free for the next pickup). */
export const lastNight = (start: string, end: string) => addDays(start, rentalDays(start, end) - 1);
export const prettyDate = (ymd: string) =>
  new Date(ymd + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });

const RECENT = "baybayin-recent-booking";
export function saveRecentBooking(token: string, number: string) {
  try {
    localStorage.setItem(RECENT, JSON.stringify({ token, number, at: Date.now() }));
  } catch {}
}
export function getRecentBooking(): { token: string; number: string } | null {
  try {
    const r = JSON.parse(localStorage.getItem(RECENT) || "null");
    return r && Date.now() - r.at < 60 * 86_400_000 ? r : null;
  } catch {
    return null;
  }
}

// ---- pickup / return times (Manila, 30-minute steps; days = 24-hour blocks with a grace period)
export const TIME_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
export function slotLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** Epoch ms of a Manila local date + time. */
export const manilaInstant = (ymd: string, hhmm: string) => Date.parse(`${ymd}T${hhmm}:00+08:00`);
/** Next bookable slot: at least 30 min from now, rounded up to :00/:30 (tomorrow 9:00 AM if it's late). */
export function nextPickupSlot(): { date: string; time: string } {
  const t = Date.now() + 30 * 60_000;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
  const get = (k: string) => parts.find((p) => p.type === k)!.value;
  let mins = Number(get("hour")) * 60 + Number(get("minute"));
  mins = Math.ceil(mins / 30) * 30;
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  if (mins >= 21 * 60) return { date: addDays(date, 1), time: "09:00" };
  return { date, time: TIME_SLOTS[mins / 30] };
}
/** Rental days in 24-hour blocks; going over by more than the grace period adds a day. */
export const rentalDays24 = (pickupMs: number, returnMs: number, graceMinutes: number) =>
  Math.max(1, Math.ceil((returnMs - pickupMs - graceMinutes * 60_000) / 86_400_000));
export const prettyDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const prettyTime = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
/** Manila date (YYYY-MM-DD) of an instant. */
export const manilaDateOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
export const hoursLabel = (ms: number) => {
  const h = ms / 3_600_000;
  return Number.isInteger(h) ? `${h} h` : `${h.toFixed(1)} h`;
};

/** Bookings are open only with the switch on AND terms written. */
export const bookingsOpen = (rs: RentalSettings | null) => !!rs?.bookings_enabled && !!rs.terms?.trim();

// ---- calendar helpers
export type Taken = { scooter_id: string; pickup_at: string; blocked_until: string };
/** Days of a month grid (Mon-first), padded with nulls. */
export function monthGrid(year: number, month0: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month0, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const out: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) out.push(`${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (out.length % 7) out.push(null);
  return out;
}
/** Does a taken range touch this Manila day? */
export const touchesDay = (t: { pickup_at: string; blocked_until: string }, ymd: string) =>
  new Date(t.pickup_at).getTime() < manilaInstant(addDays(ymd, 1), "00:00") && new Date(t.blocked_until).getTime() > manilaInstant(ymd, "00:00");
export const monthLabel = (year: number, month0: number) => new Date(Date.UTC(year, month0, 15)).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
