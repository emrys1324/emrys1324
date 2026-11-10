import { NextResponse } from "next/server";
import { getSessionRole } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { refundPayment, toCentavos } from "@/lib/paymongo";

/** Full refund of an online (PayMongo) payment. Admins only. Body: { order_id } */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSessionRole();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const db = getAdminSupabase();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const { order_id } = (await req.json().catch(() => ({}))) as { order_id?: string };
  const { data: o } = await db
    .from("orders")
    .select("id, order_number, total, payment_method, payment_status, paymongo_payment_id, cancel_reason")
    .eq("id", order_id ?? "")
    .single();
  if (!o) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (o.payment_method !== "online" || o.payment_status !== "paid" || !o.paymongo_payment_id) {
    return NextResponse.json({ error: o.payment_status === "refunded" ? "Already refunded." : "Only paid online orders can be refunded here." }, { status: 409 });
  }
  try {
    const r = await refundPayment(o.paymongo_payment_id, toCentavos(o.total), `Order ${o.order_number}${o.cancel_reason ? ` — ${o.cancel_reason}` : ""}`);
    await db.from("orders").update({ payment_status: "refunded", paymongo_refund_id: r.id, refunded_at: new Date().toISOString() }).eq("id", o.id);
    return NextResponse.json({ ok: true, refund_status: r.status });
  } catch (e) {
    return NextResponse.json(
      { error: `${(e as Error).message}. If this payment method can't be refunded automatically, refund it from the PayMongo dashboard.` },
      { status: 502 },
    );
  }
}
