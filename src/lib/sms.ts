// Semaphore (Philippine SMS) client. Server only.
//   SEMAPHORE_API_KEY      — required to send (Vercel env); without it texts are skipped
//   SEMAPHORE_SENDER_NAME  — optional approved sender name (e.g. BAYBAYIN); default = Semaphore's
//   SEMAPHORE_API_BASE     — tests only
export const smsConfigured = () => !!process.env.SEMAPHORE_API_KEY;
export const smsSenderName = () => process.env.SEMAPHORE_SENDER_NAME || null;

/**
 * Plain GSM characters only: one ₱ or curly quote switches a text to Unicode, which halves
 * the length per SMS part (and doubles the cost). Semaphore also ignores texts starting with "TEST".
 */
export function smsText(s: string): string {
  const t = s
    .replace(/₱/g, "P")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[·•]/g, "-")
    .replace(/…/g, "...")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  return /^test/i.test(t) ? `Hi! ${t}` : t;
}

export const toSmsNumber = (phone: string) => {
  const p = phone.replace(/[\s\-()]/g, "");
  if (/^\+?639\d{9}$/.test(p)) return "0" + p.replace(/^\+?63/, "");
  return /^09\d{9}$/.test(p) ? p : null;
};

export interface SmsResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendSms(number: string, message: string): Promise<SmsResult> {
  const key = process.env.SEMAPHORE_API_KEY;
  if (!key) return { ok: false, error: "SMS not set up (SEMAPHORE_API_KEY missing)" };
  const to = toSmsNumber(number);
  if (!to) return { ok: false, error: `Not a PH mobile number: ${number}` };
  const body = new URLSearchParams({ apikey: key, number: to, message: smsText(message) });
  const sender = smsSenderName();
  if (sender) body.set("sendername", sender);
  try {
    const res = await fetch(`${process.env.SEMAPHORE_API_BASE || "https://api.semaphore.co"}/api/v4/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
    const json = (await res.json().catch(() => null)) as unknown;
    const first = Array.isArray(json) ? (json[0] as { message_id?: number | string; status?: string }) : null;
    if (res.ok && first?.message_id != null) return { ok: true, id: String(first.message_id) };
    const detail = json && typeof json === "object" ? Object.values(json as Record<string, unknown>).flat().join("; ") : res.statusText;
    return { ok: false, error: `Semaphore ${res.status}: ${detail || "unexpected response"}` };
  } catch (e) {
    return { ok: false, error: `Semaphore unreachable: ${(e as Error).message}` };
  }
}
