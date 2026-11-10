import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paymongo";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * PayMongo webhook (event: checkout_session.payment.paid).
 * Verifies the signature, then marks the order paid in the database (idempotent).
 */
export const runtime = "nodejs";

interface PaidEvent {
  data?: {
    attributes?: {
      type?: string;
      livemode?: boolean;
      data?: { id?: string; attributes?: { payments?: { id: string; attributes?: { amount?: number; status?: string } }[] } };
    };
  };
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET || "";
  const sig = verifyWebhookSignature(raw, req.headers.get("paymongo-signature"), secret);
  if (!sig.ok) return NextResponse.json({ error: sig.reason }, { status: 401 });

  const evt = JSON.parse(raw) as PaidEvent;
  const type = evt.data?.attributes?.type;
  if (type !== "checkout_session.payment.paid") return NextResponse.json({ ignored: type ?? "unknown" });

  const session = evt.data?.attributes?.data;
  const payment = session?.attributes?.payments?.find((p) => p.attributes?.status === "paid") ?? session?.attributes?.payments?.[0];
  if (!session?.id || !payment?.id || typeof payment.attributes?.amount !== "number") {
    return NextResponse.json({ error: "malformed event" }, { status: 400 });
  }

  const db = getAdminSupabase();
  if (!db) return NextResponse.json({ error: "server not configured" }, { status: 500 }); // PayMongo retries
  const { data: outcome, error } = await db.rpc("mark_order_paid", {
    p_checkout_id: session.id,
    p_payment_id: payment.id,
    p_amount_centavos: payment.attributes.amount,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); // PayMongo retries
  if (outcome === "amount_mismatch") console.error("PayMongo amount mismatch", session.id, payment.attributes.amount);
  return NextResponse.json({ outcome, livemode: sig.livemode });
}
