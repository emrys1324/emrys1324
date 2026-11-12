import { NextResponse } from "next/server";
import { getSessionRole } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { refundPayment } from "@/lib/hitpay";
import { sendBookingSms } from "@/lib/rental-sms";

/** Refunds a cancelled booking's online deposit (HitPay). Needs Rentals + Refunds. Body: { booking_id } */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSessionRole();
  if (!session || !session.perms.includes("refunds") || !session.perms.includes("rentals"))
    return NextResponse.json({ error: "You need the Rentals and Refunds permissions to refund a deposit." }, { status: 403 });
  const db = getAdminSupabase();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const { booking_id } = (await req.json().catch(() => ({}))) as { booking_id?: string };
  const { data: b } = await db.from("rental_bookings").select("id, status, payment_status, deposit_amount, gateway_payment_id").eq("id", booking_id ?? "").single();
  if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (b.payment_status === "refunded") return NextResponse.json({ error: "Already refunded." }, { status: 409 });
  if (b.status !== "cancelled") return NextResponse.json({ error: "Cancel the booking first, then refund the deposit." }, { status: 409 });
  if (!["deposit_paid", "paid"].includes(b.payment_status) || !b.gateway_payment_id)
    return NextResponse.json({ error: "There's no online deposit to refund on this booking." }, { status: 409 });
  try {
    const r = await refundPayment(b.gateway_payment_id, Number(b.deposit_amount));
    await db.from("rental_bookings").update({ payment_status: "refunded", gateway_refund_id: r.id }).eq("id", b.id);
    await sendBookingSms(db, b.id, "refunded").catch((e) => console.error("refund SMS failed", e));
    return NextResponse.json({ ok: true, refund_status: r.status });
  } catch (e) {
    return NextResponse.json({ error: `${(e as Error).message}. If this payment method can't be refunded automatically, refund it from the HitPay dashboard.` }, { status: 502 });
  }
}
