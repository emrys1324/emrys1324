import { NextResponse } from "next/server";
import { hitpayConfigured } from "@/lib/hitpay";
import { confirmPayment } from "@/lib/payments";
import { getAdminSupabase } from "@/lib/supabase/admin";

/** Return-check after HitPay: confirms the deposit with HitPay's API (covers a slow webhook). Body: { token } */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = getAdminSupabase();
  if (!db || !hitpayConfigured()) return NextResponse.json({ outcome: "unavailable" }, { status: 503 });
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "Invalid booking." }, { status: 400 });
  const { data: b } = await db.from("rental_bookings").select("gateway_ref, payment_status").eq("public_token", token).single();
  if (!b?.gateway_ref) return NextResponse.json({ outcome: "not_found" }, { status: 404 });
  if (b.payment_status !== "awaiting_payment") return NextResponse.json({ outcome: "already_paid" });
  try {
    return NextResponse.json(await confirmPayment(db, b.gateway_ref));
  } catch (e) {
    console.error("HitPay deposit verify failed", e);
    return NextResponse.json({ outcome: "error" }, { status: 502 });
  }
}
