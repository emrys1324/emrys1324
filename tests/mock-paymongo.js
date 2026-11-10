// A tiny stand-in for PayMongo used by tests/payments-e2e.test.js.
// API:  POST /v1/checkout_sessions, POST /v1/refunds
// Page: GET /checkout/:id (fake hosted page) → POST /checkout/:id/pay sends a signed
//       checkout_session.payment.paid webhook to the app, then redirects to success_url.
const http = require("http");
const { createHmac } = require("crypto");

function startMockPaymongo({ port = 4010, webhookUrl, webhookSecret }) {
  const sessions = new Map();
  const refunds = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (req.method === "POST" && url.pathname === "/v1/checkout_sessions") {
        const a = JSON.parse(raw).data.attributes;
        const id = `cs_e2e_${sessions.size + 1}`;
        const amount = a.line_items.reduce((s, l) => s + l.amount * l.quantity, 0);
        sessions.set(id, { id, amount, a, paid: false });
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ data: { id, attributes: { checkout_url: `http://127.0.0.1:${port}/checkout/${id}` } } }));
      }
      if (req.method === "POST" && url.pathname === "/v1/refunds") {
        const a = JSON.parse(raw).data.attributes;
        refunds.push(a);
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ data: { id: `ref_e2e_${refunds.length}`, attributes: { status: "pending", amount: a.amount } } }));
      }
      const m = url.pathname.match(/^\/checkout\/(cs_e2e_\d+)(\/pay)?$/);
      if (m && sessions.has(m[1])) {
        const s = sessions.get(m[1]);
        if (req.method === "GET") {
          res.setHeader("Content-Type", "text/html");
          return res.end(`<!doctype html><title>PayMongo (mock)</title><h1>PayMongo checkout (mock)</h1>
            <p id="ref">${s.a.reference_number}</p><p id="amount">PHP ${(s.amount / 100).toFixed(2)}</p>
            <p id="methods">${s.a.payment_method_types.join(",")}</p>
            <form method="post" action="/checkout/${s.id}/pay"><button>Pay with GCash</button></form>
            <a href="${s.a.cancel_url}">Back to merchant</a>`);
        }
        // pay → signed webhook → redirect
        s.paid = true;
        const body = JSON.stringify({ data: { id: `evt_${s.id}`, attributes: { type: "checkout_session.payment.paid", livemode: false,
          data: { id: s.id, attributes: { payments: [{ id: `pay_${s.id}`, attributes: { amount: s.amount, status: "paid" } }] } } } } });
        const t = Math.floor(Date.now() / 1000);
        const sig = createHmac("sha256", webhookSecret).update(`${t}.${body}`).digest("hex");
        await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json", "Paymongo-Signature": `t=${t},te=${sig},li=` }, body });
        res.writeHead(302, { Location: s.a.success_url });
        return res.end();
      }
      res.statusCode = 404;
      res.end('{"errors":[{"detail":"not found"}]}');
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, sessions, refunds })));
}

module.exports = { startMockPaymongo };
