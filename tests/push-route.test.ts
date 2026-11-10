// Tests the push sender route against local Supabase with Firebase mocked.
// Run: npx tsx tests/push-route.test.ts   (needs `npm run db:start` + `npm run seed:users`)
import { generateKeyPairSync, createVerify } from "node:crypto";
import http2 from "node:http2";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
  project_id: "isla-test",
  client_email: "push@isla-test.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
});
process.env.PUSH_WEBHOOK_SECRET = "s3cret-for-tests";

// ---- mock APNs: local HTTP/2 TLS server that verifies the ES256 provider token
const apnsKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
process.env.APNS_KEY_ID = "KEY123ABCD";
process.env.APNS_TEAM_ID = "TEAM987XYZ";
process.env.APNS_PRIVATE_KEY = apnsKey.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
const certDir = mkdtempSync(join(tmpdir(), "apns-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(certDir, "k.pem"), "-out", join(certDir, "c.pem"), "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // test-only: trust the self-signed mock
type ApnsHit = { token: string; topic: string; title: string; url: string; jwtValid: boolean; level?: string };
const apnsHits: ApnsHit[] = [];
const apnsServer = http2.createSecureServer({ key: readFileSync(join(certDir, "k.pem")), cert: readFileSync(join(certDir, "c.pem")) }, (req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const token = String(req.headers[":path"]).split("/").pop()!;
    const [h, c, sig] = String(req.headers.authorization).replace("bearer ", "").split(".");
    const jwtValid = createVerify("SHA256").update(`${h}.${c}`).verify({ key: apnsKey.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))
      && JSON.parse(Buffer.from(h, "base64url").toString()).kid === "KEY123ABCD"
      && JSON.parse(Buffer.from(c, "base64url").toString()).iss === "TEAM987XYZ";
    if (token.startsWith("dead-")) { res.writeHead(410); return res.end('{"reason":"Unregistered"}'); }
    const p = JSON.parse(body);
    apnsHits.push({ token, topic: String(req.headers["apns-topic"]), title: p.aps.alert.title, url: p.url, jwtValid, level: p.aps["interruption-level"] });
    res.writeHead(200); res.end();
  });
});


// ---- mock Google endpoints, pass everything else through
type Sent = { token: string; title: string; body: string; url: string; channel: string };
const sent: Sent[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "https://oauth2.googleapis.com/token") return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }));
  if (url.startsWith("https://fcm.googleapis.com/v1/projects/isla-test/messages:send")) {
    const m = JSON.parse(String(init?.body)).message;
    if (m.token.startsWith("dead-")) return new Response('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', { status: 404 });
    sent.push({ token: m.token, title: m.notification.title, body: m.notification.body, url: m.data.url, channel: m.android.notification.channel_id });
    return new Response('{"name":"projects/isla-test/messages/1"}');
  }
  return realFetch(input, init);
}) as typeof fetch;

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok", msg);
};

(async () => {
  await new Promise<void>((r) => apnsServer.listen(0, r));
  process.env.APNS_HOST = `https://localhost:${(apnsServer.address() as { port: number }).port}`;
  const { POST } = await import("../src/app/api/push/order-event/route");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const call = (body: object, secret = "s3cret-for-tests") =>
    POST(new Request("http://x/api/push/order-event", { method: "POST", headers: { "x-push-secret": secret }, body: JSON.stringify(body) }));

  const { data: admin } = await db.from("users").select("id").eq("role", "admin").single();
  const { data: rider } = await db.from("riders").select("id, user_id").single();
  await db.from("push_tokens").insert([
    { token: "admin-tablet-token-000000000000", platform: "android", user_id: admin!.id },
    { token: "dead-admin-phone-token-00000000", platform: "android", user_id: admin!.id },
    { token: "dead-admin-iphone-token-0000000", platform: "ios", user_id: admin!.id },
    { token: "admin-iphone-token-000000000000", platform: "ios", user_id: admin!.id },
    { token: "rider-phone-token-0000000000000", platform: "android", user_id: rider!.user_id },
    { token: "guest-phone-token-0000000000000", platform: "ios", user_id: null },
  ]);
  await db.from("store_settings").update({ open_time: "00:00", close_time: "00:00", is_open: true }).eq("id", 1);
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: placed, error } = await anon.rpc("place_order", {
    p_order: { customer_name: "Maria Santos", customer_phone: "09171234567", order_type: "delivery", zone_id: (await db.from("delivery_zones").select("id").eq("name", "Poblacion").single()).data!.id, street: "Purok 3", payment_method: "cash" },
    p_items: [{ menu_item_id: "30000000-0000-0000-0000-000000000017", quantity: 1 }],
  });
  if (error) throw error;
  await anon.rpc("subscribe_order_push", { p_token: "guest-phone-token-0000000000000", p_platform: "ios", p_order_token: placed.token });
  const { data: order } = await db.from("orders").select("id").eq("public_token", placed.token).single();

  let res = await call({ order_id: order!.id, new_order: true }, "wrong");
  assert(res.status === 401, "wrong secret rejected");

  res = await call({ order_id: order!.id, new_order: true });
  let json = await res.json();
  assert(sent.length === 1 && sent[0].token.startsWith("admin-tablet") && sent[0].title.includes(placed.order_number), "new order → admin tablet notified");
  assert(sent[0].channel === "orders_urgent" && sent[0].url === "/admin", "staff alert uses urgent channel and opens /admin");
  assert(apnsHits.length === 1 && apnsHits[0].token.startsWith("admin-iphone") && apnsHits[0].level === "time-sensitive", "new order → admin iPhone notified via APNs as time-sensitive");
  assert(json.removed === 2, "dead Android (404) and iPhone (410) tokens removed");
  apnsHits.length = 0;
  assert(!(await db.from("push_tokens").select("token").eq("token", "dead-admin-phone-token-00000000")).data?.length, "dead token gone from database");

  sent.length = 0;
  await db.from("orders").update({ rider_id: rider!.id }).eq("id", order!.id);
  await call({ order_id: order!.id, rider_assigned: true });
  assert(sent.length === 1 && sent[0].token.startsWith("rider-phone") && sent[0].url === "/rider", "rider assignment → rider phone notified");

  sent.length = 0;
  await db.from("orders").update({ status: "out_for_delivery" }).eq("id", order!.id);
  await call({ order_id: order!.id, status_changed: true });
  assert(sent.length === 0 && apnsHits.length === 1 && apnsHits[0].token.startsWith("guest-phone"), "status change → subscribed iPhone guest notified via APNs (no one else)");
  assert(apnsHits[0].jwtValid, "APNs provider token is a valid ES256 JWT with key id + team id");
  assert(apnsHits[0].topic === "cafe.pahuway.isla", "APNs topic is the Isla bundle id");
  assert(apnsHits[0].title.startsWith("On the way") && apnsHits[0].url === `/order/${placed.token}` && !apnsHits[0].level, "customer message text and link correct (not time-sensitive)");

  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.APNS_KEY_ID;
  res = await call({ order_id: order!.id, status_changed: true });
  json = await res.json();
  assert(json.skipped, "without Firebase configured the route skips quietly");
  apnsServer.close();
  console.log("\nALL PUSH ROUTE TESTS PASSED");
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
