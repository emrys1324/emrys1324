import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal PayMongo client (no SDK). Server-only.
 * Env: PAYMONGO_SECRET_KEY (sk_test_… / sk_live_…), PAYMONGO_WEBHOOK_SECRET (whsk_…),
 *      PAYMONGO_METHODS (default "gcash,qrph"), PAYMONGO_API_BASE (tests only).
 */
const base = () => process.env.PAYMONGO_API_BASE || "https://api.paymongo.com";

export function paymongoConfigured(): boolean {
  return !!process.env.PAYMONGO_SECRET_KEY;
}

export function paymentMethods(): string[] {
  return (process.env.PAYMONGO_METHODS || "gcash,qrph")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) throw new Error("PAYMONGO_SECRET_KEY is not set");
  const res = await fetch(base() + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Basic " + Buffer.from(key + ":").toString("base64"),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { errors?: { detail?: string; code?: string }[] } & T;
  if (!res.ok) {
    const detail = json.errors?.map((e) => e.detail || e.code).join("; ") || res.statusText;
    throw new Error(`PayMongo ${res.status}: ${detail}`);
  }
  return json;
}

export const toCentavos = (pesos: number | string) => Math.round(Number(pesos) * 100);

export interface CheckoutOrder {
  id: string;
  order_number: string;
  total: number;
  delivery_fee: number;
  items: { item_name: string; unit_price: number; quantity: number }[];
}

/** Creates a hosted Checkout Session and returns its id + URL. */
export async function createCheckoutSession(order: CheckoutOrder, urls: { success: string; cancel: string }) {
  let lineItems = order.items.map((i) => ({ name: i.item_name.slice(0, 100), amount: toCentavos(i.unit_price), quantity: i.quantity, currency: "PHP" }));
  if (Number(order.delivery_fee) > 0) lineItems.push({ name: "Delivery fee", amount: toCentavos(order.delivery_fee), quantity: 1, currency: "PHP" });
  const sum = lineItems.reduce((s, l) => s + l.amount * l.quantity, 0);
  if (sum !== toCentavos(order.total)) {
    // Never charge a different amount than the order total — fall back to one line.
    lineItems = [{ name: `Pahuway Cafe order ${order.order_number}`, amount: toCentavos(order.total), quantity: 1, currency: "PHP" }];
  }
  const res = await call<{ data: { id: string; attributes: { checkout_url: string } } }>("/v1/checkout_sessions", {
    data: {
      attributes: {
        line_items: lineItems,
        payment_method_types: paymentMethods(),
        success_url: urls.success,
        cancel_url: urls.cancel,
        reference_number: order.order_number,
        description: `Pahuway Cafe order ${order.order_number}`,
        show_description: true,
        show_line_items: true,
        send_email_receipt: false,
        metadata: { order_id: order.id, order_number: order.order_number },
      },
    },
  });
  return { id: res.data.id, url: res.data.attributes.checkout_url };
}

export async function refundPayment(paymentId: string, amountCentavos: number, notes: string) {
  const res = await call<{ data: { id: string; attributes: { status: string } } }>("/v1/refunds", {
    data: { attributes: { payment_id: paymentId, amount: amountCentavos, reason: "requested_by_customer", notes: notes.slice(0, 255) } },
  });
  return { id: res.data.id, status: res.data.attributes.status };
}

/**
 * Verifies the `Paymongo-Signature` header: "t=<unix>,te=<test sig>,li=<live sig>".
 * Signature = HMAC-SHA256(webhook secret, `${t}.${rawBody}`) as hex.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, secret: string, toleranceSec = 900, now = Date.now()) {
  if (!header || !secret) return { ok: false as const, reason: "missing signature" };
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  ) as Record<string, string>;
  const t = Number(parts.t);
  if (!t) return { ok: false as const, reason: "missing timestamp" };
  if (Math.abs(now / 1000 - t) > toleranceSec) return { ok: false as const, reason: "timestamp too old" };
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const match = (sig?: string) => !!sig && sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (match(parts.li)) return { ok: true as const, livemode: true };
  if (match(parts.te)) return { ok: true as const, livemode: false };
  return { ok: false as const, reason: "signature mismatch" };
}
