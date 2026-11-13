import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { hitpayConfigured } from "@/lib/hitpay";
import { confirmPayment } from "@/lib/payments";

/**
 * A customer who couldn't finish paying online switches the order to manual GCash (screenshot upload).
 * First asks HitPay whether it was paid after all — if so, the order is simply confirmed instead.
 * Body: { token, proof_path }
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = getAdminSupabase();
  if (!db) return NextResponse.json({ error: "Not available right now. Please try again." }, { status: 503 });
  const { token, proof_path } = (await req.json().catch(() => ({}))) as { token?: string; proof_path?: string };
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  const { data: o } = await db.from("orders").select("id, gateway_ref, payment_method, payment_status, status").eq("public_token", token).single();
  if (!o) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (o.gateway_ref && hitpayConfigured()) {
    try {
      const r = await confirmPayment(db, o.gateway_ref);
      if (["paid", "already_paid", "paid_after_cancel"].includes(r.outcome)) return NextResponse.json({ paid: true });
    } catch (e) {
      console.error("HitPay check before GCash switch failed", e); // carry on: the customer wants to pay by GCash
    }
  }
  const { data, error } = await db.rpc("switch_order_to_gcash", { p_token: token, p_proof_path: proof_path ?? null });
  if (error) return NextResponse.json({ error: "Couldn't switch to GCash. Please try again." }, { status: 500 });
  const msg: Record<string, [number, string]> = {
    invalid_proof: [400, "Please attach a screenshot of your GCash payment."],
    not_found: [404, "Order not found."],
    cancelled: [409, "This order was cancelled. Please place a new order."],
    not_awaiting: [409, "This order isn't waiting for an online payment anymore."],
  };
  if (data !== "switched") return NextResponse.json({ error: msg[data as string]?.[1] ?? "Couldn't switch to GCash." }, { status: msg[data as string]?.[0] ?? 409 });
  return NextResponse.json({ switched: true });
}
