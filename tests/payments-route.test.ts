// HitPay checkout / webhook / verify routes against local Supabase with a mock HitPay API.
// Run: npm run test:payments  (needs `npm run db:start` + `npm run seed:users`)
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startMockHitpay, hitpayHmac } = require("./mock-hitpay");

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const assert = (c: unknown, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
  console.log("ok", m);
};
const SALT = "salt_test_123";

(async () => {
  const mock = await startMockHitpay({ port: 4011, salt: SALT, webhooks: false, apiKey: "hp_test_key" });
  process.env.HITPAY_API_BASE = "http://127.0.0.1:4011";
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await db.from("store_settings").update({ open_time: "00:00", close_time: "00:00", is_open: true, online_payments_enabled: true }).eq("id", 1);

  const checkout = (await import("../src/app/api/payments/checkout/route")).POST;
  const webhook = (await import("../src/app/api/payments/webhook/route")).POST;
  const verify = (await import("../src/app/api/payments/verify/route")).POST;
  const post = (fn: (r: Request) => Promise<Response>, body: string, headers: Record<string, string> = { "Content-Type": "application/json" }) =>
    fn(new Request("http://localhost:3000/api/x", { method: "POST", headers, body }));
  const place = async (paymentMethod: string, qty = 2) => {
    const zone = (await db.from("delivery_zones").select("id").eq("name", "Poblacion").single()).data!.id;
    const { data, error } = await anon.rpc("place_order", {
      p_order: { customer_name: "Ana Reyes", customer_phone: "09171112222", order_type: "delivery", zone_id: zone, street: "Purok 1", payment_method: paymentMethod },
      p_items: [{ menu_item_id: "30000000-0000-0000-0000-000000000017", quantity: qty }],
    });
    if (error) throw error;
    return data as { token: string; order_number: string };
  };
  const formHook = (fields: Record<string, string>) => post(webhook, new URLSearchParams(fields).toString(), { "Content-Type": "application/x-www-form-urlencoded" });

  // not configured
  delete process.env.HITPAY_API_KEY;
  const o = await place("online"); // 2 × ₱220 + ₱30 delivery = ₱470
  assert((await post(checkout, JSON.stringify({ token: o.token }))).status === 503, "checkout refuses politely when HitPay isn't configured");

  process.env.HITPAY_API_KEY = "hp_test_key";
  process.env.HITPAY_SALT = SALT;
  let res = await post(checkout, JSON.stringify({ token: o.token }));
  const j = await res.json();
  assert(res.status === 200 && j.url === "http://127.0.0.1:4011/checkout/pr_1", "checkout returns the HitPay payment page URL");
  const c = mock.calls[0];
  assert(c.key === "hp_test_key" && c.xrw === "XMLHttpRequest" && c.ctype === "application/x-www-form-urlencoded", "authenticates with X-BUSINESS-API-KEY, form-encoded");
  const pr = mock.requests.get("pr_1");
  assert(pr.amount === "470.00" && pr.currency === "PHP", "asks for exactly ₱470.00 PHP");
  assert(JSON.stringify(pr.payment_methods) === '["gcash","qrph"]', "only GCash and QR Ph offered");
  assert(pr.reference_number === o.order_number && pr.name === "Ana Reyes" && pr.phone === "09171112222", "order number + customer details sent");
  assert(pr.redirect_url === `http://localhost:3000/order/${o.token}?new=1&paid=1` && pr.webhook === "http://localhost:3000/api/payments/webhook", "redirect + webhook URLs set");
  const { data: saved } = await db.from("orders").select("gateway_ref, payment_gateway").eq("public_token", o.token).single();
  assert(saved?.gateway_ref === "pr_1" && saved.payment_gateway === "hitpay", "payment request id saved on the order");
  res = await post(checkout, JSON.stringify({ token: o.token }));
  assert((await res.json()).url.endsWith("/checkout/pr_1") && mock.requests.size === 1, "retrying reuses the same payment request");
  const cash = await place("cash");
  assert((await post(checkout, JSON.stringify({ token: cash.token }))).status === 404, "cash orders can't start online payment");

  // ---- webhook: signature first, then confirm with the API
  const fields: Record<string, string> = { payment_id: "pay_pr_1", payment_request_id: "pr_1", phone: "09171112222", amount: "470.00", currency: "PHP", status: "completed", reference_number: o.order_number };
  assert((await formHook({ ...fields, hmac: "deadbeef" })).status === 401, "forged hmac rejected");
  assert((await formHook({ ...fields, amount: "1.00", hmac: hitpayHmac(fields, SALT) })).status === 401, "tampered field (amount) breaks the hmac");
  res = await formHook({ ...fields, hmac: hitpayHmac(fields, SALT) });
  assert((await res.json()).outcome === "not_paid", "validly signed webhook still not trusted while HitPay says unpaid");
  mock.requests.get("pr_1").status = "completed";
  mock.requests.get("pr_1").payments = [{ id: "pay_pr_1", status: "succeeded", amount: "470.00" }];
  res = await formHook({ ...fields, hmac: hitpayHmac(fields, SALT) });
  assert((await res.json()).outcome === "paid", "valid webhook + HitPay confirms → order paid");
  const { data: paid } = await db.from("orders").select("payment_status, gateway_payment_id, paid_at").eq("public_token", o.token).single();
  assert(paid?.payment_status === "paid" && paid.gateway_payment_id === "pay_pr_1" && paid.paid_at, "HitPay payment id recorded");
  res = await formHook({ ...fields, hmac: hitpayHmac(fields, SALT) });
  assert((await res.json()).outcome === "already_paid", "duplicate webhook is harmless");
  const failed = { ...fields, status: "failed" };
  res = await formHook({ ...failed, hmac: hitpayHmac(failed, SALT) });
  assert((await res.json()).ignored === "failed", "failed-payment webhook ignored");
  // JSON (event) webhook format
  const evt = JSON.stringify({ payment_request_id: "pr_1", status: "completed" });
  assert((await post(webhook, evt, { "Content-Type": "application/json", "Hitpay-Signature": "bad" })).status === 401, "JSON webhook with bad signature rejected");
  res = await post(webhook, evt, { "Content-Type": "application/json", "Hitpay-Signature": createHmac("sha256", SALT).update(evt).digest("hex") });
  assert((await res.json()).outcome === "already_paid", "JSON webhook format verified too");
  assert((await post(checkout, JSON.stringify({ token: o.token }))).status === 409, "paid order can't be sent to checkout again");

  // ---- amount mismatch: HitPay reports a different amount → refused
  const o2 = await place("online", 1); // ₱250
  await post(checkout, JSON.stringify({ token: o2.token }));
  const pr2 = mock.requests.get("pr_2");
  pr2.status = "completed";
  pr2.payments = [{ id: "pay_pr_2", status: "succeeded", amount: "1.00" }];
  res = await post(verify, JSON.stringify({ token: o2.token }));
  assert((await res.json()).outcome === "amount_mismatch", "payment for the wrong amount is not accepted");

  // ---- return-check works with NO webhook at all
  const o3 = await place("online", 1);
  await post(checkout, JSON.stringify({ token: o3.token }));
  assert((await (await post(verify, JSON.stringify({ token: o3.token }))).json()).outcome === "not_paid", "return-check before paying: not paid");
  const pr3 = mock.requests.get("pr_3");
  pr3.status = "completed";
  pr3.payments = [{ id: "pay_pr_3", status: "succeeded", amount: "250.00" }];
  assert((await (await post(verify, JSON.stringify({ token: o3.token }))).json()).outcome === "paid", "return-check confirms payment with HitPay even without a webhook");

  const late = await place("online", 1);
  await db.from("orders").update({ payment_expires_at: new Date(Date.now() - 60000).toISOString() }).eq("public_token", late.token);
  assert((await post(checkout, JSON.stringify({ token: late.token }))).status === 410, "expired payment window refused");

  mock.server.close();
  console.log("\nALL PAYMENT ROUTE TESTS PASSED");
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
