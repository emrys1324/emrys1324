import { NextResponse } from "next/server";
import { getSessionRole } from "@/lib/supabase/server";
import { hitpayConfigured, isSandbox, paymentMethods } from "@/lib/hitpay";

/** Tells the admin Settings page whether HitPay keys are configured (never returns the keys). */
export async function GET() {
  const session = await getSessionRole();
  if (!session || !(session.perms.includes("settings") || session.perms.includes("rentals"))) return NextResponse.json({ error: "Settings permission needed" }, { status: 403 });
  return NextResponse.json({
    configured: hitpayConfigured() && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    testMode: isSandbox(),
    methods: paymentMethods() ?? [], // [] = all methods enabled on the HitPay account
  });
}
