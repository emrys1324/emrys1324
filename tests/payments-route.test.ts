// PayMongo checkout + webhook routes against local Supabase with a mock PayMongo API.
// Run: npx tsx tests/payments-route.test.ts  (needs `npm run db:start` + `npm run seed:users`)
import { createHmac } from "node:crypto";
import http from "node:http";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const assert = (c: unknown, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
  console.log("ok", m);
};

// ---- mock PayMongo API
const calls: { path: string; auth: string; body: any }[] = [];
let sessionSeq = 0;
const mock = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    calls.push({ path: req.url!, auth: String(req.headers.authorization), body: raw ? JSON.parse(raw) : null });
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/checkout_sessions") {
      const id = `cs_mock_${++sessionSeq}`;
      return res.end(JSON.stringify({ data: { id, attributes: { checkout_url: `https://checkout.paymongo.com/${id}` } } }));
    }
    res.statusCode = 404;
    res.end('{"errors":[{"detail":"not found"}]}');
  });
});

const sign = (raw: string, secret: string, mode: "te" | "li" = "te", t = Math.floor(Date.now() / 1000)) =>
  `t=${t},${mode === "te" ? `te=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")},li=` : `te=,li=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`}`;

(async () => {
  await new Promise<void>((r) => mock.listen(0, r));
  process.env.PAYMONGO_API_BASE = `http://127.0.0.1:${(mock.address() as { port: number }).port}`;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await db.from("store_settings").update({ open_time: "00:00", close_time: "00:00", is_open: true, online_payments_enabled: true }).eq("id", 1);

  const checkout = (await import("../src/app/api/payments/checkout/route")).POST;
  const webhook = (await import("../src/app/api/payments/webhook/route")).POST;
  const post = (fn: (r: Request) => Promise<Response>, body: unknown, headers: Record<string, string> = {}) =>
    fn(new Request("http://localhost:3000/api/x", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));

  const place = async (paymentMethod: string, qty = 2) => {
    const { data, error } = await anon.rpc("place_order", {
      p_order: { customer_name: "Ana Reyes", customer_phone: "09171112222", order_type: "delivery", zone_id: (await db.from("delivery_zones").select("id").eq("name", "Poblacion").single()).data!.id, street: "Purok 1", payment_method: paymentMethod },
      p_items: [{ menu_item_id: "30000000-0000-0000-0000-000000000017", quantity: qty }],
    });
    if (error) throw error;
    return data as { token: string; order_number: string; total: number };
  };

  // not configured
  delete process.env.PAYMONGO_SECRET_KEY;
  const o = await place("online"); // 2 × ₱220 adobo bowl + ₱30 delivery = ₱470
  let res = await post(checkout, { token: o.token });
  assert(res.status === 503, "checkout refuses politely when PayMongo isn't configured");

  process.env.PAYMONGO_SECRET_KEY = "sk_test_mockkey123";
  process.env.PAYMONGO_WEBHOOK_SECRET = "whsk_mocksecret";
  res = await post(checkout, { token: o.token });
  const j = await res.json();
  assert(res.status === 200 && j.url === "https://checkout.paymongo.com/cs_mock_1", "checkout returns the PayMongo payment page URL");
  const c = calls[0];
  assert(c.auth === "Basic " + Buffer.from("sk_test_mockkey123:").toString("base64"), "authenticates with the secret key (Basic auth)");
  const a = c.body.data.attributes;
  assert(JSON.stringify(a.payment_method_types) === '["gcash","qrph"]', "only GCash and QR Ph offered");
  const sum = a.line_items.reduce((s: number, l: any) => s + l.amount * l.quantity, 0);
  assert(sum === 47000 && a.line_items.some((l: any) => l.name === "Delivery fee" && l.amount === 3000), "line items total ₱470 in centavos, incl. delivery fee");
  assert(a.reference_number === o.order_number && a.metadata.order_number === o.order_number, "order number sent as reference");
  assert(a.success_url === `http://localhost:3000/order/${o.token}?new=1&paid=1` && a.cancel_url === `http://localhost:3000/order/${o.token}?new=1`, "success/cancel return to the order status page");
  const { data: saved } = await db.from("orders").select("paymongo_checkout_id, checkout_url").eq("public_token", o.token).single();
  assert(saved?.paymongo_checkout_id === "cs_mock_1", "checkout session id saved on the order");

  res = await post(checkout, { token: o.token });
  assert((await res.json()).url === "https://checkout.paymongo.com/cs_mock_1" && calls.length === 1, "retrying reuses the same session (no double charge risk)");

  const cash = await place("cash");
  assert((await post(checkout, { token: cash.token })).status === 404, "cash orders can't start online payment");

  // ---- webhook
  const event = (checkoutId: string, amount: number, type = "checkout_session.payment.paid") =>
    JSON.stringify({ data: { id: "evt_1", attributes: { type, livemode: false, data: { id: checkoutId, attributes: { payments: [{ id: "pay_mock_1", attributes: { amount, status: "paid" } }] } } } } });
  let raw = event("cs_mock_1", 47000);
  assert((await post(webhook, raw, { "paymongo-signature": sign(raw, "wrong_secret") })).status === 401, "forged signature rejected");
  assert((await post(webhook, raw, { "paymongo-signature": sign(raw, "whsk_mocksecret", "te", Math.floor(Date.now() / 1000) - 3600) })).status === 401, "stale (replayed) event rejected");
  assert((await post(webhook, raw, {})).status === 401, "missing signature rejected");

  const bad = event("cs_mock_1", 100);
  res = await post(webhook, bad, { "paymongo-signature": sign(bad, "whsk_mocksecret") });
  assert((await res.json()).outcome === "amount_mismatch", "wrong amount is not accepted as payment");

  res = await post(webhook, raw, { "paymongo-signature": sign(raw, "whsk_mocksecret") });
  let w = await res.json();
  assert(res.status === 200 && w.outcome === "paid" && w.livemode === false, "valid test-mode event marks the order paid");
  const { data: paid } = await db.from("orders").select("payment_status, paymongo_payment_id, paid_at").eq("public_token", o.token).single();
  assert(paid?.payment_status === "paid" && paid.paymongo_payment_id === "pay_mock_1" && paid.paid_at, "payment recorded on the order");

  res = await post(webhook, raw, { "paymongo-signature": sign(raw, "whsk_mocksecret", "li") });
  assert((await res.json()).outcome === "already_paid", "live-mode signature verified; duplicate delivery is harmless");

  const other = event("cs_mock_1", 47000, "payment.failed");
  res = await post(webhook, other, { "paymongo-signature": sign(other, "whsk_mocksecret") });
  assert((await res.json()).ignored === "payment.failed", "unrelated event types ignored");

  res = await post(checkout, { token: o.token });
  assert(res.status === 409, "paid order can't be sent to checkout again");

  const late = await place("online", 1);
  await db.from("orders").update({ payment_expires_at: new Date(Date.now() - 60000).toISOString() }).eq("public_token", late.token);
  assert((await post(checkout, { token: late.token })).status === 410, "expired payment window refused");

  mock.close();
  console.log("\nALL PAYMENT ROUTE TESTS PASSED");
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
