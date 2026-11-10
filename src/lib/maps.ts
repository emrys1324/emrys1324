// Map helpers. The site shows OpenStreetMap; riders navigate in Google Maps or Waze.

export interface LatLng {
  lat: number;
  lng: number;
}

/** San Agustin, Romblon (town centre) — where the map opens when there's no pin yet. */
export const DEFAULT_CENTER: LatLng = { lat: 12.5693, lng: 122.1321 };

export const isLatLng = (v: unknown): v is LatLng =>
  !!v && typeof (v as LatLng).lat === "number" && typeof (v as LatLng).lng === "number" && isFinite((v as LatLng).lat) && isFinite((v as LatLng).lng);

/** Same bounds the database enforces for a delivery pin. */
export const inPhilippines = (p: LatLng) => p.lat >= 4 && p.lat <= 22 && p.lng >= 116 && p.lng <= 128;

export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function toLatLng(lat: unknown, lng: unknown): LatLng | null {
  const a = Number(lat);
  const b = Number(lng);
  return lat != null && lng != null && isFinite(a) && isFinite(b) ? { lat: a, lng: b } : null;
}

/** Turn-by-turn directions in Google Maps — to the pin if there is one, else to the typed address. */
export function googleMapsDirections(pin: LatLng | null, addressText: string): string {
  const dest = pin ? `${pin.lat},${pin.lng}` : addressText;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

/** Navigation in Waze — to the pin if there is one, else a search for the typed address. */
export function wazeDirections(pin: LatLng | null, addressText: string): string {
  return pin
    ? `https://waze.com/ul?ll=${pin.lat}%2C${pin.lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(addressText)}&navigate=yes`;
}

/** View a pin on Google Maps (for staff). */
export const googleMapsPin = (pin: LatLng) => `https://www.google.com/maps/search/?api=1&query=${pin.lat}%2C${pin.lng}`;
