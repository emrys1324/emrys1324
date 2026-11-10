// Loads the Google Maps JavaScript API once, in the browser.
// No key, a failed load or a rejected key → the site falls back to OpenStreetMap (see MapView).
import { useSyncExternalStore } from "react";

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
export const GOOGLE_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

type Status = "off" | "ok" | "failed";
let status: Status = GOOGLE_MAPS_KEY ? "ok" : "off";
const listeners = new Set<() => void>();
const setStatus = (s: Status) => {
  status = s;
  listeners.forEach((l) => l());
};

let loading: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (status !== "ok") return Promise.reject(new Error("Google Maps is not available"));
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    if ((w.google as typeof google | undefined)?.maps?.Map) return resolve(w.google as typeof google);
    const cb = "__pahuwayGoogleMapsReady";
    w[cb] = () => resolve(w.google as typeof google);
    // Google calls this when the key is wrong/restricted → switch every map back to OpenStreetMap
    w.gm_authFailure = () => {
      console.warn("Google Maps rejected the API key — using OpenStreetMap instead.");
      setStatus("failed");
    };
    const s = document.createElement("script");
    s.src =
      "https://maps.googleapis.com/maps/api/js?" +
      new URLSearchParams({ key: GOOGLE_MAPS_KEY, v: "weekly", libraries: "places,marker,geocoding", loading: "async", callback: cb, region: "PH", language: "en" });
    s.async = true;
    s.onerror = () => {
      setStatus("failed");
      reject(new Error("Couldn't load Google Maps"));
    };
    document.head.appendChild(s);
  });
  loading.catch(() => setStatus("failed"));
  return loading;
}

/** true while Google Maps should be used (key present and not failed). */
export function useGoogleMaps(): boolean {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => (GOOGLE_MAPS_KEY ? "ok" : "off"),
  );
  return s === "ok";
}
