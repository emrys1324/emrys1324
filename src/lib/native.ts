"use client";
// Bridges to the Isla native app (Capacitor). Every function is a safe no-op in a normal browser.
import { getSupabase } from "./supabase/client";

const TOKEN_KEY = "isla-push-token";

type CapWindow = Window & { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } };

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as CapWindow).Capacitor?.isNativePlatform?.();
}

export function nativePlatform(): "android" | "ios" | "web" {
  if (!isNativeApp()) return "web";
  return (window as CapWindow).Capacitor?.getPlatform?.() === "ios" ? "ios" : "android";
}

let shellReady = false;

/** One-time setup when the app starts: status bar, splash, notification taps, Android channels. */
export async function initNativeShell() {
  if (!isNativeApp() || shellReady) return;
  shellReady = true;
  const [{ StatusBar, Style }, { SplashScreen }, { PushNotifications }] = await Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/splash-screen"),
    import("@capacitor/push-notifications"),
  ]);
  try {
    await StatusBar.setStyle({ style: Style.Light }); // light background → dark icons
    if (nativePlatform() === "android") await StatusBar.setBackgroundColor({ color: "#fbf7f0" });
  } catch {}
  SplashScreen.hide().catch(() => {});

  if (nativePlatform() === "android") {
    await PushNotifications.createChannel({
      id: "orders_urgent",
      name: "New orders & deliveries",
      description: "Staff and rider alerts",
      importance: 5,
      sound: "default",
      vibration: true,
      visibility: 1,
    }).catch(() => {});
    await PushNotifications.createChannel({
      id: "order_updates",
      name: "Order updates",
      description: "When your order is ready or on the way",
      importance: 4,
      sound: "default",
      visibility: 1,
    }).catch(() => {});
  }

  // Tapping a notification opens the screen it refers to
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    // Android (FCM): data.url · iPhone (APNs): custom key "url" in the payload
    const data = action.notification.data as { url?: string; aps?: unknown } | undefined;
    const url = data?.url;
    if (url && url.startsWith("/")) window.location.href = url;
  });
}

/** Ask permission (if needed) and return this device's push token, or null if refused/unavailable. */
let pushSupport: Promise<boolean> | null = null;
function pushSupportedByBuild(): Promise<boolean> {
  if (nativePlatform() !== "android") return Promise.resolve(true); // iOS: a failed registration just returns an error
  pushSupport ??= (async () => {
    try {
      const { registerPlugin } = await import("@capacitor/core");
      const IslaConfig = registerPlugin<{ get: () => Promise<{ pushEnabled: boolean }> }>("IslaConfig");
      return (await IslaConfig.get()).pushEnabled;
    } catch {
      return false; // older app build without the check → don't risk a crash
    }
  })();
  return pushSupport;
}

async function getPushToken(): Promise<string | null> {
  if (!isNativeApp()) return null;
  // Android builds without Firebase config would crash inside the push plugin.
  if (!(await pushSupportedByBuild())) return null;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return null;

  // Attach the listeners BEFORE calling register(): iOS does not replay a missed
  // "registration" event, so a late listener would lose the token.
  let done: (t: string | null) => void = () => {};
  const result = new Promise<string | null>((resolve) => (done = resolve));
  const onToken = await PushNotifications.addListener("registration", (t) => {
    if (typeof t?.value !== "string" || t.value.length < 20) return; // ignore empty/garbled events
    try {
      localStorage.setItem(TOKEN_KEY, t.value);
    } catch {}
    done(t.value);
  });
  const onError = await PushNotifications.addListener("registrationError", () => done(null));
  const timer = setTimeout(() => done(localStorage.getItem(TOKEN_KEY)), 10_000);
  PushNotifications.register().catch(() => done(null));
  const token = await result;
  clearTimeout(timer);
  onToken.remove().catch(() => {});
  onError.remove().catch(() => {});
  return token;
}

export type PushResult = "enabled" | "denied" | "unavailable";

/** True when this app build can receive push notifications (false in browsers). */
export async function pushAvailable(): Promise<boolean> {
  return isNativeApp() && (await pushSupportedByBuild());
}

/** Staff & riders: link this device to the signed-in account (new orders / assignments). */
export async function enableAccountPush(): Promise<PushResult> {
  if (!isNativeApp() || !(await pushSupportedByBuild())) return "unavailable";
  const token = await getPushToken();
  if (!token) return "denied";
  const platform = nativePlatform();
  const { error } = await getSupabase().rpc("register_push_token", { p_token: token, p_platform: platform });
  return error ? "unavailable" : "enabled";
}

/** Customers: get updates about one order (works for guests too). */
export async function enableOrderPush(orderToken: string): Promise<PushResult> {
  if (!isNativeApp() || !(await pushSupportedByBuild())) return "unavailable";
  const token = await getPushToken();
  if (!token) return "denied";
  const { error } = await getSupabase().rpc("subscribe_order_push", { p_token: token, p_platform: nativePlatform(), p_order_token: orderToken });
  return error ? "unavailable" : "enabled";
}

/** Call before signing out so a shared tablet stops receiving that person's alerts. */
export async function unlinkPushOnSignOut() {
  if (!isNativeApp()) return;
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && token !== "undefined") await getSupabase().rpc("unregister_push_token", { p_token: token });
  } catch {}
}

/** Sign out everywhere in the app (unlinks push first). */
export async function signOutAndGo(path: string) {
  await unlinkPushOnSignOut();
  await getSupabase().auth.signOut();
  window.location.href = path;
}
