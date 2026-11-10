"use client";
import { useEffect, useRef, useState } from "react";
import { useGoogleMaps } from "@/lib/google-maps";
import { locateBarangay, matchZone, resolveSuggestion, reverseGeocode, type FoundAddress, type Suggestion } from "@/lib/address-lookup";
import type { LatLng } from "@/lib/maps";

interface Args {
  zones: { id: string; name: string }[];
  zoneId: string;
  setZoneId: (v: string) => void;
  street: string;
  setStreet: (v: string) => void;
  landmark: string;
  setLandmark: (v: string) => void;
  pin: LatLng | null;
  setPin: (p: LatLng | null) => void;
}

/**
 * Keeps the address fields and the map in step (Google Maps only):
 * - barangay chosen, no pin yet → the map shows that barangay
 * - address suggestion picked → pin moves there, barangay + landmark fill in
 * - pin moved → empty street / landmark / barangay fill in from the map
 * Never overwrites something the customer typed.
 */
export function useAddressSync(a: Args) {
  const enabled = useGoogleMaps();
  const [center, setCenter] = useState<LatLng | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const latest = useRef(a);
  latest.current = a;
  const zoneName = a.zones.find((z) => z.id === a.zoneId)?.name;

  useEffect(() => {
    if (!enabled || !zoneName) return;
    let stale = false;
    locateBarangay(zoneName)
      .then((p) => !stale && setCenter(p))
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [enabled, zoneName]);

  const fillEmpty = (found: FoundAddress, overwriteStreet = false) => {
    const s = latest.current;
    const filled: string[] = [];
    if (found.street && (overwriteStreet || !s.street.trim())) {
      if (found.street !== s.street) filled.push("street");
      s.setStreet(found.street.slice(0, 160));
    }
    if (found.landmark && !s.landmark.trim() && found.landmark !== found.street) {
      s.setLandmark(found.landmark.slice(0, 160));
      filled.push("landmark");
    }
    if (!s.zoneId) {
      const z = matchZone(s.zones, found.barangay, found.fullText);
      if (z) {
        s.setZoneId(z.id);
        filled.push("barangay");
      }
    }
    return filled;
  };

  /** use instead of setPin for map taps / drags / current location */
  const onPinChange = (p: LatLng | null) => {
    latest.current.setPin(p);
    setNote(null);
    if (!enabled || !p) return;
    reverseGeocode(p)
      .then((found) => {
        if (!found) return;
        const filled = fillEmpty(found);
        if (filled.length) setNote(`Filled in the ${filled.join(", ")} from the map — please check.`);
      })
      .catch(() => {});
  };

  /** a Google address suggestion was picked from the street field */
  const onSuggestion = async (s: Suggestion) => {
    try {
      const found = await resolveSuggestion(s);
      if (found.pin) latest.current.setPin(found.pin);
      const filled = fillEmpty(found, true);
      setNote(found.pin ? `Pinned on the map${filled.some((f) => f !== "street") ? ` and filled in the ${filled.filter((f) => f !== "street").join(", ")}` : ""} — drag the pin to your exact door if needed.` : null);
    } catch {
      latest.current.setStreet(s.main);
    }
  };

  return { enabled, center: a.pin ? null : center, note, onPinChange, onSuggestion };
}
