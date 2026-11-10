import { NextResponse } from "next/server";
import { verifyFormWebhook, verifyJsonWebhook } from "@/lib/hitpay";
import { confirmPayment } from "@/lib/payments";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * HitPay webhook. Accepts both HitPay formats:
 *  • payment-request webhook (form-encoded, `hmac` field), and
 *  • event webhook (JSON, `Hitpay-Signature` header).
 * After the signature check, the payment is re-confirmed with HitPay's API before
 * the order is marked paid (amount comes from HitPay, not from the webhook body).
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const salt = process.env.HITPAY_SALT || "";
  const raw = await req.text();
  const isJson = (req.headers.get("content-type") || "").includes("application/json");

  let ref: string | undefined;
  if (isJson) {
    if (!verifyJsonWebhook(raw, req.headers.get("hitpay-signature"), salt)) return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    const body = JSON.parse(raw) as { payment_request_id?: string; payment_request?: { id?: string }; id?: string };
    ref = body.payment_request_id ?? body.payment_request?.id;
  } else {
    const fields = Object.fromEntries(new URLSearchParams(raw));
    if (!verifyFormWebhook(fields, salt)) return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    if (fields.status && fields.status !== "completed") return NextResponse.json({ ignored: fields.status });
    ref = fields.payment_request_id;
  }
  if (!ref) return NextResponse.json({ ignored: "no payment request id" });

  const db = getAdminSupabase();
  if (!db) return NextResponse.json({ error: "server not configured" }, { status: 500 }); // HitPay retries
  try {
    const r = await confirmPayment(db, ref);
    return NextResponse.json(r);
  } catch (e) {
    console.error("HitPay webhook confirm failed", e);
    return NextResponse.json({ error: "confirm failed" }, { status: 500 }); // HitPay retries
  }
}
