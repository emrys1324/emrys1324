import type { SupabaseClient } from "@supabase/supabase-js";
import { getPaymentStatus } from "./hitpay";

/**
 * Confirms a payment with HitPay's API and records it (shared by the webhook and
 * the return-check). Never trusts the webhook body or the browser for amounts.
 */
export async function confirmPayment(db: SupabaseClient, ref: string) {
  const s = await getPaymentStatus(ref);
  if (!s.completed || !s.paymentId) return { outcome: "not_paid" as const, gatewayStatus: s.status };
  const { data, error } = await db.rpc("mark_order_paid", { p_ref: ref, p_payment_id: s.paymentId, p_amount_centavos: s.amountCentavos });
  if (error) throw new Error(error.message);
  if (data === "amount_mismatch") console.error("HitPay amount mismatch", ref, s.amountCentavos);
  return { outcome: data as "paid" | "already_paid" | "paid_after_cancel" | "amount_mismatch" | "not_found", gatewayStatus: s.status };
}
