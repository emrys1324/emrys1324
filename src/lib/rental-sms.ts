// Scooter-booking texts: confirmed, reminder, cancelled, refunded, staff alert. Server only (service role).
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSms, smsConfigured } from "./sms";

export type SmsKind = "confirmed" | "reminder" | "cancelled" | "refunded" | "staff_alert";
const STAMP: Partial<Record<SmsKind, string>> = { confirmed: "sms_confirmed_at", reminder: "sms_reminded_at", cancelled: "sms_cancelled_at", refunded: "sms_refunded_at" };

interface Row {
  id: string;
  booking_number: string;
  public_token: string;
  scooter_name: string;
  customer_name: string;
  customer_phone: string;
  pickup_at: string;
  return_at: string;
  days: number;
  delivery: boolean;
  delivery_address: string | null;
  total: number;
  deposit_amount: number;
  security_deposit: number;
  payment_status: string;
  status: string;
  cancel_reason: string | null;
}

const when = (iso: string) =>
  new Date(iso)
    .toLocaleString("en-US", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    .replace(/,/g, "")
    .replace(/\s(AM|PM)$/, "$1");
const peso = (n: number) => `P${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const firstName = (n: string) => n.trim().split(/\s+/)[0];

async function context(db: SupabaseClient) {
  const [{ data: rs }, { data: ss }] = await Promise.all([
    db.from("rental_settings").select("sms_enabled, staff_alert_phones, pickup_note, reminder_hours").eq("id", 1).single(),
    db.from("store_settings").select("baybayin_name").eq("id", 1).single(),
  ]);
  return {
    enabled: rs?.sms_enabled !== false,
    staff: (rs?.staff_alert_phones ?? "").split(/[,;\s]+/).filter(Boolean) as string[],
    pickupNote: (rs?.pickup_note as string | null) ?? null,
    brand: (ss?.baybayin_name as string | null)?.trim() || "Baybayin",
    site: (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, ""),
  };
}

export function bookingMessage(kind: SmsKind, b: Row, c: Awaited<ReturnType<typeof context>>): string {
  const link = c.site ? ` ${c.site}/baybayin/booking/${b.public_token}` : "";
  const balance = Number(b.total) - (["deposit_paid", "paid"].includes(b.payment_status) ? Number(b.deposit_amount) : 0);
  const place = b.delivery ? `We'll deliver to ${b.delivery_address}.` : c.pickupNote ? `Pickup: ${c.pickupNote}.` : "";
  switch (kind) {
    case "confirmed":
      return `${c.brand}: Hi ${firstName(b.customer_name)}, booking ${b.booking_number} is confirmed! ${b.scooter_name}, ${when(b.pickup_at)} to ${when(b.return_at)}. Balance at pickup ${peso(balance)}.${link}`;
    case "reminder":
      return `${c.brand}: Reminder - ${b.scooter_name} ${b.delivery ? "delivery" : "pickup"} at ${when(b.pickup_at)} (${b.booking_number}). ${place} Bring your license${balance > 0 ? `, ${peso(balance)} balance` : ""}${Number(b.security_deposit) > 0 ? ` and ${peso(b.security_deposit)} security deposit` : ""}.`;
    case "cancelled":
      return `${c.brand}: Booking ${b.booking_number} (${b.scooter_name}, ${when(b.pickup_at)}) has been cancelled.${b.cancel_reason ? ` Reason: ${b.cancel_reason}.` : ""}${["deposit_paid", "paid"].includes(b.payment_status) ? " Your deposit will be refunded." : ""}`;
    case "refunded":
      return `${c.brand}: Your ${peso(b.deposit_amount)} deposit for ${b.booking_number} has been refunded. It may take a few days to reach your account.`;
    case "staff_alert":
      return `${c.brand}: New booking ${b.booking_number} - ${b.customer_name} ${b.customer_phone}, ${b.scooter_name}, ${when(b.pickup_at)} to ${when(b.return_at)}${b.delivery ? `, DELIVERY to ${b.delivery_address}` : ""}. Deposit ${peso(b.deposit_amount)} paid.`;
  }
}

/**
 * Sends one kind of text for a booking. Each customer text is sent at most once (claimed by a
 * timestamp first); `force` resends (staff "Resend"). Every attempt is logged.
 */
export async function sendBookingSms(db: SupabaseClient, bookingId: string, kind: SmsKind, opts: { force?: boolean } = {}) {
  const c = await context(db);
  if (!c.enabled && !opts.force) return { sent: 0, skipped: "SMS turned off" };
  const stamp = STAMP[kind];
  if (stamp && !opts.force) {
    const { data: claimed } = await db.from("rental_bookings").update({ [stamp]: new Date().toISOString() }).eq("id", bookingId).is(stamp, null).select("id");
    if (!claimed?.length) return { sent: 0, skipped: "already sent" };
  }
  const { data: b } = await db.from("rental_bookings").select("*").eq("id", bookingId).single();
  if (!b) return { sent: 0, skipped: "booking not found" };
  const message = bookingMessage(kind, b as Row, c);
  const recipients = kind === "staff_alert" ? c.staff : [b.customer_phone as string];
  let sent = 0;
  for (const to of recipients) {
    const r = smsConfigured() ? await sendSms(to, message) : { ok: false, error: "SMS not set up (SEMAPHORE_API_KEY missing)" };
    await db.from("rental_sms_log").insert({
      booking_id: bookingId,
      kind,
      to_number: to,
      message,
      status: r.ok ? "sent" : smsConfigured() ? "failed" : "skipped",
      provider_id: r.ok ? r.id : null,
      error: r.ok ? null : r.error,
    });
    if (r.ok) sent++;
  }
  return { sent };
}

/** After a deposit is confirmed: text the customer and alert staff. Never throws. */
export async function onBookingConfirmed(db: SupabaseClient, gatewayRef: string) {
  try {
    const { data: b } = await db.from("rental_bookings").select("id").eq("gateway_ref", gatewayRef).single();
    if (!b) return;
    const first = await sendBookingSms(db, b.id, "confirmed");
    if (first.skipped !== "already sent") await sendBookingSms(db, b.id, "staff_alert");
  } catch (e) {
    console.error("booking SMS failed", e);
  }
}
