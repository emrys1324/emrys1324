import type { StoreSettings } from "./types";

/** "HH:MM[:SS]" → minutes since midnight */
export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Current wall-clock time in the store's timezone (default Asia/Manila). */
export function storeNow(tz = "Asia/Manila", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { minutes: get("hour") * 60 + get("minute"), seconds: get("second") };
}

/** Same rule as public.within_hours() in the database. */
export function withinHours(mins: number, open: string, close: string): boolean {
  const o = toMinutes(open);
  const c = toMinutes(close);
  return c > o ? mins >= o && mins < c : mins >= o || mins < c;
}

export function isStoreOpen(s: StoreSettings | null, now = new Date()): boolean {
  if (!s || !s.is_open) return false;
  return withinHours(storeNow(s.timezone, now).minutes, s.open_time, s.close_time);
}

export function formatClock(t: string): string {
  const mins = toMinutes(t);
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function formatHours(s: StoreSettings): string {
  return `${formatClock(s.open_time)} – ${formatClock(s.close_time)}`;
}

export function formatDateTime(iso: string, tz = "Asia/Manila"): string {
  return new Date(iso).toLocaleString("en-PH", { timeZone: tz, hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
}

export function formatTime(iso: string, tz = "Asia/Manila"): string {
  return new Date(iso).toLocaleTimeString("en-PH", { timeZone: tz, hour: "numeric", minute: "2-digit" });
}

/**
 * Today's schedulable slots in 15-minute steps, starting after the prep time
 * and ending 15 minutes before closing. Returns absolute ISO timestamps.
 */
export function timeSlots(s: StoreSettings, now = new Date()): { iso: string; label: string }[] {
  const { minutes: nowMin, seconds } = storeNow(s.timezone, now);
  const open = toMinutes(s.open_time);
  let close = toMinutes(s.close_time);
  if (close <= open) close += 1440; // closes after midnight

  // Express "now" on the same axis as open..close
  let cur = nowMin;
  if (cur < open && nowMin + 1440 < close) cur += 1440;

  const earliest = Math.max(cur + Math.max(s.prep_minutes, 15), open);
  const first = Math.ceil(earliest / 15) * 15;
  const base = now.getTime() - (seconds * 1000 + now.getMilliseconds());

  const slots: { iso: string; label: string }[] = [];
  for (let m = first; m <= close - 15; m += 15) {
    const d = new Date(base + (m - cur) * 60_000);
    slots.push({ iso: d.toISOString(), label: formatTime(d.toISOString(), s.timezone) });
  }
  return slots;
}
