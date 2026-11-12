// Stand-in for Semaphore's SMS API used by the rental tests: POST /api/v4/messages (form) → records the text.
const http = require("http");
function startMockSemaphore({ port = 4020, apiKey = "sm_test" } = {}) {
  const messages = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const json = (o, s = 200) => {
      res.writeHead(s, { "Content-Type": "application/json" });
      res.end(JSON.stringify(o));
    };
    if (req.method === "POST" && req.url.startsWith("/api/v4/messages")) {
      const f = new URLSearchParams(raw);
      if (f.get("apikey") !== apiKey) return json({ apikey: ["The selected apikey is invalid."] }, 401);
      if (!/^(09|639)\d{9}$/.test(f.get("number") || "")) return json({ number: ["The number format is invalid."] }, 422);
      const m = { message_id: messages.length + 1000, number: f.get("number"), message: f.get("message"), sendername: f.get("sendername") };
      messages.push(m);
      return json([{ message_id: m.message_id, recipient: m.number, message: m.message, status: "Pending" }]);
    }
    json({ message: "Not found" }, 404);
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, messages })));
}
module.exports = { startMockSemaphore };
