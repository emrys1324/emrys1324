import type { SupabaseClient } from "@supabase/supabase-js";
import { getPaymentStatus } from "./hitpay";
import { onBookingConfirmed } from "./rental-sms";

/**
 * Confirms a payment with HitPay's API and records it (shared by the webhook and
 * the return-check). Never trusts the webhook body or the browser for amounts.
 */
export async function confirmPayment(db: SupabaseClient, ref: string) {
  const s = await getPaymentStatus(ref);
  if (!s.completed || !s.paymentId) return { outcome: "not_paid" as const, gatewayStatus: s.status };
  const args = { p_ref: ref, p_payment_id: s.paymentId, p_amount_centavos: s.amountCentavos };
  let { data, error } = await db.rpc("mark_order_paid", args);
  let booking = false;
  if (!error && data === "not_found") {
    ({ data, error } = await db.rpc("mark_booking_paid", args)); // a scooter-rental deposit
    booking = true;
  }
  if (error) throw new Error(error.message);
  if (booking && data === "paid") await onBookingConfirmed(db, ref); // texts: customer confirmation + staff alert
  if (data === "amount_mismatch") console.error("HitPay amount mismatch", ref, s.amountCentavos);
  return { outcome: data as "paid" | "already_paid" | "paid_after_cancel" | "amount_mismatch" | "not_found", gatewayStatus: s.status };
}
