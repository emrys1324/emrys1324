import { createSign } from "node:crypto";

/**
 * Minimal Firebase Cloud Messaging (HTTP v1) sender — no SDK needed.
 * Env: FIREBASE_SERVICE_ACCOUNT = the service-account JSON from Firebase
 * (raw JSON or base64 of it).
 */
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cachedToken: { value: string; exp: number } | null = null;

export function getServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const sa = JSON.parse(json) as ServiceAccount;
    return sa.project_id && sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key.replace(/\\n/g, "\n"));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${b64url(signature)}`,
    }),
  });
  if (!res.ok) throw new Error(`Google auth failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Path inside the app to open when tapped, e.g. "/admin" */
  url: string;
  /** Louder, high-priority channel for staff alerts */
  urgent?: boolean;
}

export type SendResult = { token: string; ok: boolean; unregistered: boolean; error?: string };

export async function sendFcm(tokens: string[], msg: PushMessage): Promise<SendResult[]> {
  const sa = getServiceAccount();
  if (!sa || tokens.length === 0) return [];
  const auth = await accessToken(sa);
  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  return Promise.all(
    tokens.map(async (token): Promise<SendResult> => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: msg.title, body: msg.body },
            data: { url: msg.url },
            android: {
              priority: "high",
              notification: { channel_id: msg.urgent ? "orders_urgent" : "order_updates", sound: "default" },
            },
            apns: {
              headers: { "apns-priority": "10" },
              payload: { aps: { sound: "default", ...(msg.urgent ? { "interruption-level": "time-sensitive" } : {}) } },
            },
          },
        }),
      });
      if (res.ok) return { token, ok: true, unregistered: false };
      const text = await res.text();
      // Token is dead (app uninstalled / reinstalled) → caller removes it
      const unregistered = res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(text);
      return { token, ok: false, unregistered, error: `${res.status} ${text.slice(0, 200)}` };
    }),
  );
}

/** Route each device to the right service: Android → Firebase, iPhone → Apple (APNs). */
export async function sendPush(devices: { token: string; platform: string }[], msg: PushMessage): Promise<SendResult[]> {
  const { sendApns } = await import("./apns");
  const android = devices.filter((d) => d.platform === "android").map((d) => d.token);
  const ios = devices.filter((d) => d.platform === "ios").map((d) => d.token);
  const [a, i] = await Promise.all([sendFcm(android, msg), sendApns(ios, msg)]);
  return [...a, ...i];
}

export async function pushConfigured() {
  const { apnsConfigured } = await import("./apns");
  return !!getServiceAccount() || apnsConfigured();
}
