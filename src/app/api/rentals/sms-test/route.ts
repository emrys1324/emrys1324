import { NextResponse } from "next/server";
import { getSessionRole } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { sendSms, smsConfigured, smsText, toSmsNumber } from "@/lib/sms";

/** Rentals → Settings → "Send test text". Body: { phone } */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSessionRole();
  const db = getAdminSupabase();
  if (!session || !session.perms.includes("rentals") || !db) return NextResponse.json({ error: "Rentals permission needed" }, { status: 403 });
  if (!smsConfigured()) return NextResponse.json({ error: "Text messages aren't set up yet: add SEMAPHORE_API_KEY on Vercel and redeploy." }, { status: 503 });
  const { phone } = (await req.json().catch(() => ({}))) as { phone?: string };
  const to = toSmsNumber(phone ?? "");
  if (!to) return NextResponse.json({ error: "Enter a mobile number like 09XXXXXXXXX." }, { status: 400 });
  const { data: ss } = await db.from("store_settings").select("baybayin_name").eq("id", 1).single();
  const message = smsText(`${ss?.baybayin_name?.trim() || "Baybayin"}: Hello! Text messages for scooter bookings are working.`);
  const r = await sendSms(to, message);
  await db.from("rental_sms_log").insert({ kind: "test", to_number: to, message, status: r.ok ? "sent" : "failed", provider_id: r.ok ? r.id : null, error: r.ok ? null : r.error });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 502 });
}
