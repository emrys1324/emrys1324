// A small stand-in for HitPay used by the payment tests.
// API:  POST /v1/payment-requests (form), GET /v1/payment-requests/:id, POST /v1/refund
// Page: GET /checkout/:id → POST /checkout/:id/pay marks it paid, sends the signed
//       form webhook (hmac) to the app unless `webhooks: false`, then redirects to
//       redirect_url?reference=<id>&status=completed (like HitPay).
const http = require("http");
const { createHmac } = require("crypto");

function hitpayHmac(fields, salt) {
  const msg = Object.keys(fields).filter((k) => k !== "hmac").sort().map((k) => `${k}${fields[k]}`).join("");
  return createHmac("sha256", salt).update(msg).digest("hex");
}

function startMockHitpay({ port = 4010, salt, webhooks = true, apiKey }) {
  const requests = new Map();
  const refunds = [];
  const calls = [];
  const opts = { webhooks };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const json = (o, code = 200) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
      if (url.pathname.startsWith("/v1/")) {
        calls.push({ method: req.method, path: url.pathname, key: req.headers["x-business-api-key"], xrw: req.headers["x-requested-with"], ctype: req.headers["content-type"], body: raw });
        if (apiKey && req.headers["x-business-api-key"] !== apiKey) return json({ message: "Invalid business api key" }, 401);
      }
      if (req.method === "POST" && url.pathname === "/v1/payment-requests") {
        const f = new URLSearchParams(raw);
        const id = `pr_${requests.size + 1}`;
        const r = { id, amount: f.get("amount"), currency: f.get("currency"), reference_number: f.get("reference_number"), purpose: f.get("purpose"),
          redirect_url: f.get("redirect_url"), webhook: f.get("webhook"), payment_methods: f.getAll("payment_methods[]"), name: f.get("name"), phone: f.get("phone"),
          status: "pending", payments: [], url: `http://127.0.0.1:${port}/checkout/${id}` };
        requests.set(id, r);
        return json(r, 201);
      }
      let m = url.pathname.match(/^\/v1\/payment-requests\/(pr_\d+)$/);
      if (req.method === "GET" && m) return requests.has(m[1]) ? json(requests.get(m[1])) : json({ message: "Not found" }, 404);
      if (req.method === "POST" && url.pathname === "/v1/refund") {
        const f = new URLSearchParams(raw);
        refunds.push({ payment_id: f.get("payment_id"), amount: f.get("amount") });
        return json({ id: `rf_${refunds.length}`, payment_id: f.get("payment_id"), amount_refunded: f.get("amount"), status: "succeeded" }, 201);
      }
      m = url.pathname.match(/^\/checkout\/(pr_\d+)(\/pay)?$/);
      if (m && requests.has(m[1])) {
        const r = requests.get(m[1]);
        if (req.method === "GET") {
          res.setHeader("Content-Type", "text/html");
          return res.end(`<!doctype html><title>HitPay (mock)</title><h1>HitPay checkout (mock)</h1>
            <p id="ref">${r.reference_number}</p><p id="amount">PHP ${r.amount}</p><p id="methods">${r.payment_methods.join(",")}</p>
            <form method="post" action="/checkout/${r.id}/pay"><button>Pay with GCash</button></form>
            <a href="${r.redirect_url}">Back to merchant</a>`);
        }
        r.status = "completed";
        r.payments = [{ id: `pay_${r.id}`, status: "succeeded", amount: r.amount }];
        if (opts.webhooks) {
          const fields = { payment_id: `pay_${r.id}`, payment_request_id: r.id, phone: r.phone || "", amount: r.amount, currency: "PHP", status: "completed", reference_number: r.reference_number };
          fields.hmac = hitpayHmac(fields, salt);
          await fetch(r.webhook, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() }).catch(() => {});
        }
        const back = new URL(r.redirect_url);
        back.searchParams.set("reference", r.id);
        back.searchParams.set("status", "completed");
        res.writeHead(302, { Location: back.toString() });
        return res.end();
      }
      json({ message: "Not found" }, 404);
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, requests, refunds, calls, opts })));
}

module.exports = { startMockHitpay, hitpayHmac };
