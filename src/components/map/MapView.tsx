"use client";
import { GoogleMap } from "./GoogleMap";
import { LeafletMap } from "./LeafletMap";
import { useGoogleMaps } from "@/lib/google-maps";
import type { LatLng } from "@/lib/maps";

export interface MapProps {
  value: LatLng | null;
  onChange?: (p: LatLng) => void;
  /** where to look when there's no pin yet (e.g. the chosen barangay) */
  center?: LatLng | null;
  interactive?: boolean;
  className?: string;
  zoom?: number;
  label?: string;
}

/** Google Maps when a key is set (and works), otherwise OpenStreetMap. */
export function MapView(props: MapProps) {
  return useGoogleMaps() ? <GoogleMap {...props} /> : <LeafletMap {...props} />;
}
