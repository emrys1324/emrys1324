import { NextResponse } from "next/server";
import { getSessionRole } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { sendBookingSms, type SmsKind } from "@/lib/rental-sms";
import { smsConfigured, smsSenderName } from "@/lib/sms";

/**
 * Booking texts triggered by staff. Body: { booking_id, kind, resend? }
 *  - kind "confirmed": after staff verify the GCash deposit (sent once; only for confirmed bookings)
 *  - kind "cancelled": after cancelling (sent once; only for cancelled bookings)
 *  - kind "refunded": after staff mark a GCash deposit as sent back (sent once)
 *  - resend: true re-sends a customer text (confirmed / reminder / cancelled / refunded)
 * GET → whether SMS is set up (for Rentals → Settings).
 */
export const runtime = "nodejs";

async function guard() {
  const session = await getSessionRole();
  if (!session || !session.perms.includes("rentals")) return null;
  return getAdminSupabase();
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: "Rentals permission needed" }, { status: 403 });
  return NextResponse.json({ configured: smsConfigured(), sender: smsSenderName() });
}

export async function POST(req: Request) {
  const db = await guard();
  if (!db) return NextResponse.json({ error: "Rentals permission needed" }, { status: 403 });
  const { booking_id, kind, resend } = (await req.json().catch(() => ({}))) as { booking_id?: string; kind?: SmsKind; resend?: boolean };
  if (!["confirmed", "reminder", "cancelled", "refunded"].includes(kind ?? "")) return NextResponse.json({ error: "Unknown text" }, { status: 400 });
  const { data: b } = await db.from("rental_bookings").select("id, status, payment_status").eq("id", booking_id ?? "").single();
  if (!b) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (kind === "confirmed" && !["confirmed", "picked_up", "returned"].includes(b.status)) return NextResponse.json({ error: "The booking isn't confirmed." }, { status: 409 });
  if (kind === "cancelled" && b.status !== "cancelled") return NextResponse.json({ error: "The booking isn't cancelled." }, { status: 409 });
  if (kind === "refunded" && b.payment_status !== "refunded") return NextResponse.json({ error: "The deposit isn't refunded." }, { status: 409 });
  if (!smsConfigured() && !resend) return NextResponse.json({ sent: 0, skipped: "SMS not set up" }); // automatic texts: quietly skip
  if (!smsConfigured()) return NextResponse.json({ error: "Text messages aren't set up yet (SEMAPHORE_API_KEY on Vercel)." }, { status: 503 });
  const r = await sendBookingSms(db, b.id, kind!, { force: !!resend });
  if (!r.sent && r.skipped !== "already sent" && r.skipped !== "SMS turned off") return NextResponse.json({ error: "The text couldn't be sent — see the booking's text log." }, { status: 502 });
  return NextResponse.json(r);
}
