import { createPrivateKey, createSign } from "node:crypto";
import http2 from "node:http2";
import type { PushMessage, SendResult } from "./fcm";

/**
 * Apple Push Notification service sender (token-based auth, HTTP/2).
 * Env: APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (contents of the .p8 file, or base64 of it),
 *      APNS_BUNDLE_ID (default cafe.pahuway.isla), APNS_ENV = "production" | "sandbox" (default production).
 */
export function apnsConfigured() {
  return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY);
}

let cachedJwt: { value: string; iat: number } | null = null;

function providerToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.iat < 50 * 60) return cachedJwt.value; // Apple: refresh at most every 20–60 min
  let pem = process.env.APNS_PRIVATE_KEY!.trim();
  if (!pem.includes("BEGIN")) pem = Buffer.from(pem, "base64").toString("utf8");
  pem = pem.replace(/\\n/g, "\n");
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: process.env.APNS_KEY_ID })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: now })).toString("base64url");
  const sig = createSign("SHA256")
    .update(`${header}.${claims}`)
    .sign({ key: createPrivateKey(pem), dsaEncoding: "ieee-p1363" })
    .toString("base64url");
  cachedJwt = { value: `${header}.${claims}.${sig}`, iat: now };
  return cachedJwt.value;
}

export async function sendApns(tokens: string[], msg: PushMessage): Promise<SendResult[]> {
  if (!apnsConfigured() || tokens.length === 0) return [];
  const host =
    process.env.APNS_HOST || (process.env.APNS_ENV === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com");
  const topic = process.env.APNS_BUNDLE_ID || "cafe.pahuway.isla";
  const jwt = providerToken();
  const payload = JSON.stringify({
    aps: {
      alert: { title: msg.title, body: msg.body },
      sound: "default",
      ...(msg.urgent ? { "interruption-level": "time-sensitive" } : {}),
    },
    url: msg.url,
  });

  const client = http2.connect(host);
  try {
    return await Promise.all(
      tokens.map(
        (token) =>
          new Promise<SendResult>((resolve) => {
            const req = client.request({
              ":method": "POST",
              ":path": `/3/device/${token}`,
              authorization: `bearer ${jwt}`,
              "apns-topic": topic,
              "apns-push-type": "alert",
              "apns-priority": "10",
              "content-type": "application/json",
            });
            let status = 0;
            let body = "";
            req.on("response", (h) => (status = Number(h[":status"])));
            req.on("data", (c) => (body += c));
            req.on("end", () => {
              if (status === 200) return resolve({ token, ok: true, unregistered: false });
              const unregistered = status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(body);
              resolve({ token, ok: false, unregistered, error: `${status} ${body.slice(0, 200)}` });
            });
            req.on("error", (e) => resolve({ token, ok: false, unregistered: false, error: e.message }));
            req.setTimeout(10_000, () => {
              req.close();
              resolve({ token, ok: false, unregistered: false, error: "timeout" });
            });
            req.end(payload);
          }),
      ),
    );
  } finally {
    client.close();
  }
}
