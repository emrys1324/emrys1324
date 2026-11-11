"use client";
import { useEffect, useRef } from "react";
import { DEFAULT_CENTER, round6, type LatLng } from "@/lib/maps";
import { GOOGLE_MAP_ID, loadGoogleMaps } from "@/lib/google-maps";
import type { MapProps } from "./MapView";

/** Google Maps version of the delivery map (same behaviour as LeafletMap). */
export function GoogleMap({ value, onChange, center, interactive = false, className = "", zoom = 16, label = "Map" }: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const marker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const g = useRef<typeof google | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  const pinContent = () => {
    const d = document.createElement("div");
    d.className = "isla-pin isla-pin-google";
    d.innerHTML = '<span class="isla-pin-dot" aria-hidden="true"></span>';
    return d;
  };

  function placeMarker(p: LatLng) {
    const gm = g.current;
    if (!gm || !map.current) return;
    if (!marker.current) {
      marker.current = new gm.maps.marker.AdvancedMarkerElement({
        map: map.current,
        position: p,
        content: pinContent(),
        gmpDraggable: interactive,
        title: "Delivery location",
      });
      if (interactive) {
        marker.current.addListener("dragend", () => {
          const pos = marker.current?.position;
          if (!pos) return;
          const lat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
          const lng = typeof pos.lng === "function" ? pos.lng() : pos.lng;
          onChangeRef.current?.({ lat: round6(Number(lat)), lng: round6(Number(lng)) });
        });
      }
    } else {
      marker.current.position = p;
      marker.current.map = map.current;
    }
  }

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((gm) => {
        if (cancelled || !el.current || map.current) return;
        g.current = gm;
        const v = valueRef.current;
        const start = v ?? center ?? DEFAULT_CENTER;
        map.current = new gm.maps.Map(el.current, {
          center: start,
          zoom: v ? zoom : 15,
          mapId: GOOGLE_MAP_ID,
          disableDefaultUI: true,
          zoomControl: interactive,
          gestureHandling: interactive ? "greedy" : "none",
          keyboardShortcuts: interactive,
          clickableIcons: false,
        });
        if (interactive) {
          map.current.addListener("click", (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            const p = { lat: round6(e.latLng.lat()), lng: round6(e.latLng.lng()) };
            placeMarker(p);
            onChangeRef.current?.(p);
          });
        }
        if (v) placeMarker(v);
      })
      .catch(() => {}); // MapView swaps in OpenStreetMap
    return () => {
      cancelled = true;
      if (marker.current) marker.current.map = null;
      marker.current = null;
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // follow the pin (current location, address suggestion, prefill, remove)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      if (marker.current) marker.current.map = null;
      marker.current = null;
      return;
    }
    placeMarker(value);
    m.panTo(value);
    if ((m.getZoom() ?? 0) < zoom) m.setZoom(zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);

  // no pin yet → show the chosen barangay
  useEffect(() => {
    if (!map.current || !center || valueRef.current) return;
    map.current.panTo(center);
    map.current.setZoom(15);
  }, [center?.lat, center?.lng]);

  return <div ref={el} role="application" aria-label={label} data-testid="google-map" className={`isolate z-0 overflow-hidden rounded-2xl bg-coffee-50 ${className}`} />;
}
