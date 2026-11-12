import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { sendBookingSms } from "@/lib/rental-sms";

/**
 * Called by the booking page right after a customer books: texts staff that a GCash deposit is
 * waiting to be checked. Only for bookings still waiting for verification; sent once per booking.
 * Body: { token }. Never fails the booking.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token || !/^[0-9a-f-]{20,}$/i.test(token)) return NextResponse.json({ error: "Bad token" }, { status: 400 });
  try {
    const db = getAdminSupabase();
    if (!db) return NextResponse.json({ sent: 0, skipped: "server not set up" });
    const { data: b } = await db.from("rental_bookings").select("id, status, payment_status").eq("public_token", token).single();
    if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (b.status !== "awaiting_deposit" || b.payment_status !== "for_verification") return NextResponse.json({ sent: 0, skipped: "not waiting" });
    return NextResponse.json(await sendBookingSms(db, b.id, "staff_alert"));
  } catch (e) {
    console.error("new booking alert failed", e);
    return NextResponse.json({ sent: 0, skipped: "error" });
  }
}
