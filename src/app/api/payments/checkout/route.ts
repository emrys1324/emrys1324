import { NextResponse } from "next/server";
import { createPaymentRequest, hitpayConfigured } from "@/lib/hitpay";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * Starts (or resumes) online payment for an order placed with payment_method "online".
 * Body: { token } — the order's public status-link token.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = getAdminSupabase();
  if (!db || !hitpayConfigured()) {
    return NextResponse.json({ error: "Online payment isn't set up yet. Please pay with cash or GCash." }, { status: 503 });
  }
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Invalid order." }, { status: 400 });

  const { data: order } = await db
    .from("orders")
    .select("id, order_number, public_token, status, total, customer_name, customer_phone, payment_method, payment_status, payment_expires_at, checkout_url")
    .eq("public_token", token)
    .single();
  if (!order || order.payment_method !== "online") return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.payment_status !== "awaiting_payment") return NextResponse.json({ error: "This order is already paid.", paid: true }, { status: 409 });
  if (order.status === "cancelled" || (order.payment_expires_at && new Date(order.payment_expires_at) < new Date())) {
    return NextResponse.json({ error: "The payment window for this order has closed. Please place a new order." }, { status: 410 });
  }
  if (order.checkout_url) return NextResponse.json({ url: order.checkout_url }); // resume the same payment request

  const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  try {
    const pr = await createPaymentRequest(order, {
      redirect: `${site}/order/${token}?new=1&paid=1`,
      webhook: `${site}/api/payments/webhook`,
    });
    const { error } = await db.from("orders").update({ gateway_ref: pr.id, checkout_url: pr.url, payment_gateway: "hitpay" }).eq("id", order.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ url: pr.url });
  } catch (e) {
    console.error("HitPay payment request failed", e);
    return NextResponse.json({ error: "We couldn't start the online payment. Please try again in a moment." }, { status: 502 });
  }
}
