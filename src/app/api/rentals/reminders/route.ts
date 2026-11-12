import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { sendBookingSms } from "@/lib/rental-sms";

/** Called every 10 minutes by the database (pg_cron) with its private key: texts due pickup reminders, once each. */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = getAdminSupabase();
  if (!db) return NextResponse.json({ error: "server not configured" }, { status: 500 });
  const { data: ok } = await db.rpc("rental_cron_key_ok", { p_key: req.headers.get("x-cron-key") ?? "" });
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data: rs } = await db.from("rental_settings").select("sms_enabled, reminder_hours").eq("id", 1).single();
  if (!rs?.sms_enabled) return NextResponse.json({ sent: 0, skipped: "SMS off" });
  const now = Date.now();
  const { data: due } = await db
    .from("rental_bookings")
    .select("id")
    .eq("status", "confirmed")
    .is("sms_reminded_at", null)
    .gte("pickup_at", new Date(now).toISOString())
    .lte("pickup_at", new Date(now + rs.reminder_hours * 3_600_000).toISOString())
    .lt("deposit_paid_at", new Date(now - 30 * 60_000).toISOString()); // just booked → the confirmation is enough
  let sent = 0;
  for (const b of due ?? []) sent += (await sendBookingSms(db, b.id, "reminder")).sent;
  return NextResponse.json({ due: due?.length ?? 0, sent });
}
