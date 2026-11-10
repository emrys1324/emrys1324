"use client";
import { useState } from "react";
import { LeafletMap } from "./LeafletMap";
import { inPhilippines, round6, type LatLng } from "@/lib/maps";

/** Optional delivery pin: tap/drag on the map, or use the phone's location. */
export function MapPicker({ value, onChange }: { value: LatLng | null; onChange: (p: LatLng | null) => void }) {
  const [locating, setLocating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const useMyLocation = () => {
    setMsg(null);
    if (!("geolocation" in navigator)) return setMsg("This phone or browser can't share its location. Please tap the map instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: round6(pos.coords.latitude), lng: round6(pos.coords.longitude) };
        if (!inPhilippines(p)) return setMsg("Your location seems to be outside the Philippines. Please tap the map to set the pin.");
        onChange(p);
        if (pos.coords.accuracy > 100) setMsg(`Location is approximate (±${Math.round(pos.coords.accuracy)} m). Drag the pin to your exact spot if needed.`);
      },
      (err) => {
        setLocating(false);
        setMsg(
          err.code === err.PERMISSION_DENIED
            ? "Location access is blocked. You can still tap the map to place the pin."
            : "Couldn't get your location. Please tap the map to place the pin.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  return (
    <div className="space-y-2" data-testid="map-picker">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label mb-0">
          Pin your location <span className="font-normal text-coffee-600">(optional, helps our rider)</span>
        </span>
        {value && (
          <button type="button" className="text-sm font-semibold text-red-700 underline" onClick={() => onChange(null)}>
            Remove pin
          </button>
        )}
      </div>
      <button type="button" className="btn-secondary btn-sm w-full" onClick={useMyLocation} disabled={locating}>
        {locating ? "Finding you…" : "📍 Use my current location"}
      </button>
      <LeafletMap value={value} onChange={onChange} interactive className="h-56 w-full border border-coffee-200" label="Delivery location map. Tap to place the pin." />
      <p className="hint" aria-live="polite">
        {msg ?? (value ? "Pinned ✓ Drag the pin to adjust." : "Tap the map to drop a pin at your door.")}
      </p>
    </div>
  );
}
