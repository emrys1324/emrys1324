import { NextResponse } from "next/server";
import { createHostedPayment, hitpayConfigured } from "@/lib/hitpay";
import { getAdminSupabase } from "@/lib/supabase/admin";

/** Starts (or resumes) the online deposit for a scooter booking. Body: { token } */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = getAdminSupabase();
  if (!db || !hitpayConfigured()) return NextResponse.json({ error: "Online payment isn't set up yet. Please contact us to book." }, { status: 503 });
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Invalid booking." }, { status: 400 });
  const { data: b } = await db
    .from("rental_bookings")
    .select("id, booking_number, public_token, status, payment_status, deposit_amount, pay_now, customer_name, customer_phone, customer_email, scooter_name, start_date, payment_expires_at, checkout_url")
    .eq("public_token", token)
    .single();
  if (!b) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (b.payment_status !== "awaiting_payment") return NextResponse.json({ error: "The deposit is already paid.", paid: true }, { status: 409 });
  if (b.status === "cancelled" || (b.payment_expires_at && new Date(b.payment_expires_at) < new Date()))
    return NextResponse.json({ error: "This booking's payment window has closed. Please book again." }, { status: 410 });
  if (b.checkout_url) return NextResponse.json({ url: b.checkout_url }); // resume the same payment request

  const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  try {
    const pr = await createHostedPayment(
      {
        amount: Number(b.pay_now ?? b.deposit_amount),
        reference: b.booking_number,
        purpose: `Baybayin scooter rental ${b.booking_number} — deposit (${b.scooter_name}, from ${b.start_date})`,
        name: b.customer_name,
        phone: b.customer_phone,
        email: b.customer_email,
      },
      { redirect: `${site}/baybayin/booking/${token}?paid=1`, webhook: `${site}/api/payments/webhook` },
    );
    const { error } = await db.from("rental_bookings").update({ gateway_ref: pr.id, checkout_url: pr.url }).eq("id", b.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ url: pr.url });
  } catch (e) {
    console.error("HitPay deposit request failed", e);
    return NextResponse.json({ error: "We couldn't start the online payment. Please try again in a moment." }, { status: 502 });
  }
}
