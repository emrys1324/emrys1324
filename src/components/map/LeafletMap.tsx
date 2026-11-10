"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LMap, Marker } from "leaflet";
import { DEFAULT_CENTER, round6, type LatLng } from "@/lib/maps";

/**
 * OpenStreetMap via Leaflet (loaded in the browser only).
 * - `interactive`: tap to place the pin, drag to adjust → onChange
 * - otherwise a still preview of `value`
 */
export function LeafletMap({
  value,
  onChange,
  interactive = false,
  className = "",
  zoom = 16,
  label = "Map",
}: {
  value: LatLng | null;
  onChange?: (p: LatLng) => void;
  interactive?: boolean;
  className?: string;
  zoom?: number;
  label?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // create the map once
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((leaflet) => {
      if (cancelled || !el.current || map.current) return;
      L.current = leaflet;
      const start = value ?? DEFAULT_CENTER;
      const m = leaflet.map(el.current, {
        center: [start.lat, start.lng],
        zoom: value ? zoom : 15,
        zoomControl: interactive,
        dragging: interactive,
        scrollWheelZoom: false, // don't hijack page scrolling
        touchZoom: interactive,
        doubleClickZoom: interactive,
        boxZoom: false,
        keyboard: interactive,
        attributionControl: true,
      });
      leaflet
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
        })
        .addTo(m);
      if (interactive) {
        m.on("click", (e) => {
          const p = { lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) };
          placeMarker(p);
          onChangeRef.current?.(p);
        });
      }
      map.current = m;
      if (value) placeMarker(value);
      // the map may mount inside a just-opened panel → recompute size
      setTimeout(() => m.invalidateSize(), 150);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function placeMarker(p: LatLng) {
    const leaflet = L.current;
    const m = map.current;
    if (!leaflet || !m) return;
    const icon = leaflet.divIcon({
      className: "isla-pin",
      html: '<span class="isla-pin-dot" aria-hidden="true"></span>',
      iconSize: [28, 40],
      iconAnchor: [14, 38],
    });
    if (!marker.current) {
      marker.current = leaflet.marker([p.lat, p.lng], { icon, draggable: interactive, keyboard: false, title: "Delivery location" }).addTo(m);
      if (interactive) {
        marker.current.on("dragend", () => {
          const ll = marker.current!.getLatLng();
          onChangeRef.current?.({ lat: round6(ll.lat), lng: round6(ll.lng) });
        });
      }
    } else {
      marker.current.setLatLng([p.lat, p.lng]);
    }
  }

  // follow external changes (e.g. "Use my current location", prefill, remove)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    placeMarker(value);
    const cur = m.getCenter();
    if (Math.abs(cur.lat - value.lat) > 1e-5 || Math.abs(cur.lng - value.lng) > 1e-5) m.setView([value.lat, value.lng], Math.max(m.getZoom(), zoom));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);

  return <div ref={el} role="application" aria-label={label} data-testid="leaflet-map" className={`isolate z-0 overflow-hidden rounded-2xl bg-coffee-50 ${className}`} />;
}
