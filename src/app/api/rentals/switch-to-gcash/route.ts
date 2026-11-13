import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { hitpayConfigured } from "@/lib/hitpay";
import { confirmPayment } from "@/lib/payments";
import { sendBookingSms } from "@/lib/rental-sms";

/**
 * A customer who couldn't finish the online deposit switches the booking to manual GCash (screenshot upload).
 * First asks HitPay whether it was paid after all — if so, the booking is simply confirmed instead.
 * Body: { token, proof_path }
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = getAdminSupabase();
  if (!db) return NextResponse.json({ error: "Not available right now. Please try again." }, { status: 503 });
  const { token, proof_path } = (await req.json().catch(() => ({}))) as { token?: string; proof_path?: string };
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Invalid booking." }, { status: 400 });
  const { data: b } = await db.from("rental_bookings").select("id, gateway_ref").eq("public_token", token).single();
  if (!b) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (b.gateway_ref && hitpayConfigured()) {
    try {
      const r = await confirmPayment(db, b.gateway_ref);
      if (["paid", "already_paid", "paid_after_cancel"].includes(r.outcome)) return NextResponse.json({ paid: true });
    } catch (e) {
      console.error("HitPay check before GCash switch failed", e);
    }
  }
  const { data, error } = await db.rpc("switch_booking_to_gcash", { p_token: token, p_proof_path: proof_path ?? null });
  if (error) return NextResponse.json({ error: "Couldn't switch to GCash. Please try again." }, { status: 500 });
  const msg: Record<string, [number, string]> = {
    invalid_proof: [400, "Please attach a screenshot of your GCash payment."],
    not_found: [404, "Booking not found."],
    cancelled: [409, "This booking was released. Please book again."],
    not_awaiting: [409, "This booking isn't waiting for an online payment anymore."],
  };
  if (data !== "switched") return NextResponse.json({ error: msg[data as string]?.[1] ?? "Couldn't switch to GCash." }, { status: msg[data as string]?.[0] ?? 409 });
  await sendBookingSms(db, b.id, "staff_alert").catch(() => null); // "check the GCash" text to staff (once)
  return NextResponse.json({ switched: true });
}
