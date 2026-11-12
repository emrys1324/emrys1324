import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal HitPay client (Payment Requests API). Server-only.
 * Env: HITPAY_API_KEY, HITPAY_SALT (both from HitPay → Settings → Payment Gateway → API Keys),
 *      HITPAY_ENV = "live" | "sandbox" (default sandbox), HITPAY_METHODS (optional; default = every method enabled on the HitPay account),
 *      HITPAY_API_BASE (tests only).
 */
export const LIVE_BASE = "https://api.hit-pay.com";
export const SANDBOX_BASE = "https://api.sandbox.hit-pay.com";

export const apiBase = () => process.env.HITPAY_API_BASE || (process.env.HITPAY_ENV === "live" ? LIVE_BASE : SANDBOX_BASE);
export const isSandbox = () => process.env.HITPAY_ENV !== "live";
export const hitpayConfigured = () => !!process.env.HITPAY_API_KEY && !!process.env.HITPAY_SALT;
/**
 * Methods to offer. Unset → don't restrict: HitPay shows whatever is enabled on the account
 * (Philippine accounts name them e.g. "qrph_netbank", "upay_instapay" — a fixed list breaks
 * checkout when a name isn't enabled).
 */
export const paymentMethods = (): string[] | undefined => {
  const list = (process.env.HITPAY_METHODS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
};
export const toCentavos = (pesos: number | string) => Math.round(Number(pesos) * 100);

type Params = Record<string, string | string[] | undefined>;

async function call<T>(method: "GET" | "POST", path: string, params?: Params): Promise<T> {
  const key = process.env.HITPAY_API_KEY;
  if (!key) throw new Error("HITPAY_API_KEY is not set");
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => body.append(`${k}[]`, x));
    else body.append(k, v);
  }
  const res = await fetch(apiBase() + path, {
    method,
    headers: {
      "X-BUSINESS-API-KEY": key,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json",
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? body.toString() : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string; errors?: Record<string, string[]> };
  if (!res.ok) {
    const detail = json.message || Object.values(json.errors ?? {}).flat().join("; ") || res.statusText;
    throw new Error(`HitPay ${res.status}: ${detail}`);
  }
  return json;
}

export interface CheckoutOrder {
  order_number: string;
  total: number;
  customer_name: string;
  customer_phone: string;
}

/** Creates a hosted payment page for exactly the order total. */
export async function createPaymentRequest(order: CheckoutOrder, urls: { redirect: string; webhook: string }) {
  return createHostedPayment(
    { amount: Number(order.total), reference: order.order_number, purpose: `Pahuway Cafe order ${order.order_number}`, name: order.customer_name, phone: order.customer_phone },
    urls,
  );
}

/** A hosted HitPay payment page for an exact amount (orders, rental deposits…). */
export async function createHostedPayment(
  p: { amount: number; reference: string; purpose: string; name: string; phone: string; email?: string | null },
  urls: { redirect: string; webhook: string },
) {
  const res = await call<{ id: string; url: string; status: string }>("POST", "/v1/payment-requests", {
    amount: Number(p.amount).toFixed(2),
    currency: "PHP",
    purpose: p.purpose.slice(0, 255),
    reference_number: p.reference,
    name: p.name.slice(0, 100),
    phone: p.phone,
    email: p.email || undefined,
    redirect_url: urls.redirect,
    webhook: urls.webhook,
    allow_repeated_payments: "false",
    payment_methods: paymentMethods(),
  });
  return { id: res.id, url: res.url };
}

interface PaymentRequest {
  id: string;
  status: string; // pending | completed | failed | expired
  amount: string;
  reference_number?: string;
  payments?: { id: string; status: string; amount: string }[];
}

/** Asks HitPay whether a payment request has really been paid (never trust the browser). */
export async function getPaymentStatus(ref: string) {
  const pr = await call<PaymentRequest>("GET", `/v1/payment-requests/${encodeURIComponent(ref)}`);
  const payment = pr.payments?.find((p) => ["succeeded", "completed"].includes(p.status));
  return {
    completed: pr.status === "completed" && !!payment,
    status: pr.status,
    paymentId: payment?.id ?? null,
    amountCentavos: toCentavos(payment?.amount ?? pr.amount),
  };
}

export async function refundPayment(paymentId: string, amountPesos: number) {
  const res = await call<{ id: string; status: string }>("POST", "/v1/refund", {
    payment_id: paymentId,
    amount: Number(amountPesos).toFixed(2),
  });
  return { id: res.id, status: res.status };
}

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * HitPay payment-request webhook (form-encoded): fields payment_id, payment_request_id,
 * phone, amount, currency, status, reference_number, hmac.
 * hmac = HMAC-SHA256(salt, concatenation of key+value for all other fields sorted by key).
 */
export function verifyFormWebhook(fields: Record<string, string>, salt: string): boolean {
  const given = fields.hmac;
  if (!given || !salt) return false;
  const message = Object.keys(fields)
    .filter((k) => k !== "hmac")
    .sort()
    .map((k) => `${k}${fields[k]}`)
    .join("");
  return safeEqual(createHmac("sha256", salt).update(message).digest("hex"), given);
}

/** HitPay event webhook (JSON): header "Hitpay-Signature" = HMAC-SHA256(salt, raw body). */
export function verifyJsonWebhook(rawBody: string, signature: string | null, salt: string): boolean {
  if (!signature || !salt) return false;
  return safeEqual(createHmac("sha256", salt).update(rawBody).digest("hex"), signature);
}
