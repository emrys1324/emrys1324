import { NextResponse } from "next/server";
import { createCheckoutSession, paymongoConfigured } from "@/lib/paymongo";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * Starts (or resumes) online payment for an order placed with payment_method "online".
 * Body: { token } — the order's public status-link token.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = getAdminSupabase();
  if (!db || !paymongoConfigured()) {
    return NextResponse.json({ error: "Online payment isn't set up yet. Please pay with cash or GCash." }, { status: 503 });
  }
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Invalid order." }, { status: 400 });

  const { data: order } = await db
    .from("orders")
    .select("id, order_number, public_token, status, total, delivery_fee, payment_method, payment_status, payment_expires_at, checkout_url, order_items(item_name, unit_price, quantity)")
    .eq("public_token", token)
    .single();
  if (!order || order.payment_method !== "online") return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.payment_status !== "awaiting_payment") return NextResponse.json({ error: "This order is already paid.", paid: true }, { status: 409 });
  if (order.status === "cancelled" || (order.payment_expires_at && new Date(order.payment_expires_at) < new Date())) {
    return NextResponse.json({ error: "The payment window for this order has closed. Please place a new order." }, { status: 410 });
  }
  if (order.checkout_url) return NextResponse.json({ url: order.checkout_url }); // resume the same session

  const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  try {
    const session = await createCheckoutSession(
      { id: order.id, order_number: order.order_number, total: order.total, delivery_fee: order.delivery_fee, items: order.order_items ?? [] },
      { success: `${site}/order/${token}?new=1&paid=1`, cancel: `${site}/order/${token}?new=1` },
    );
    const { error } = await db.from("orders").update({ paymongo_checkout_id: session.id, checkout_url: session.url }).eq("id", order.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("checkout session failed", e);
    return NextResponse.json({ error: "We couldn't start the online payment. Please try again in a moment." }, { status: 502 });
  }
}
