import { NextResponse } from "next/server";
import { hitpayConfigured } from "@/lib/hitpay";
import { confirmPayment } from "@/lib/payments";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * Return-check: when the customer comes back from HitPay, the order page asks the
 * server to confirm the payment with HitPay's API. Covers a slow or missing webhook.
 * Body: { token }. Nothing from the browser is trusted except which order to check.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = getAdminSupabase();
  if (!db || !hitpayConfigured()) return NextResponse.json({ outcome: "unavailable" }, { status: 503 });
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  const { data: o } = await db.from("orders").select("gateway_ref, payment_method, payment_status").eq("public_token", token).single();
  if (!o || o.payment_method !== "online" || !o.gateway_ref) return NextResponse.json({ outcome: "not_found" }, { status: 404 });
  if (o.payment_status !== "awaiting_payment") return NextResponse.json({ outcome: "already_paid" });
  try {
    return NextResponse.json(await confirmPayment(db, o.gateway_ref));
  } catch (e) {
    console.error("HitPay verify failed", e);
    return NextResponse.json({ outcome: "error" }, { status: 502 });
  }
}
