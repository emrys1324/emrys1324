import { NextResponse } from "next/server";
import { getSessionRole } from "@/lib/supabase/server";
import { paymentMethods, paymongoConfigured } from "@/lib/paymongo";

/** Tells the admin Settings page whether PayMongo keys are configured (never returns the keys). */
export async function GET() {
  const session = await getSessionRole();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  return NextResponse.json({
    configured: paymongoConfigured() && !!process.env.PAYMONGO_WEBHOOK_SECRET && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    testMode: (process.env.PAYMONGO_SECRET_KEY || "").startsWith("sk_test_"),
    methods: paymentMethods(),
  });
}
