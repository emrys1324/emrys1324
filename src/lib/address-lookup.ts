// Google address lookups for the delivery form. Only used when Google Maps is active.
import { loadGoogleMaps } from "./google-maps";
import { DEFAULT_CENTER, round6, type LatLng } from "./maps";

export interface Suggestion {
  id: string;
  main: string;
  secondary: string;
  prediction: google.maps.places.PlacePrediction;
}
export interface FoundAddress {
  pin: LatLng | null;
  street: string;
  landmark: string;
  barangay: string[]; // candidate barangay names, best first
  fullText: string; // whole address, for a looser barangay match
}

type Component = { types: string[]; longText?: string | null; long_name?: string };
const text = (c: Component) => (c.longText ?? c.long_name ?? "").trim();
const BARANGAY_TYPES = ["sublocality_level_1", "sublocality", "neighborhood", "administrative_area_level_5", "administrative_area_level_4", "political"];
const LOCALITY_TYPES = ["locality", "administrative_area_level_1", "administrative_area_level_2", "administrative_area_level_3", "country", "postal_code", "plus_code"];

function readComponents(components: Component[] | undefined | null): Omit<FoundAddress, "pin" | "fullText"> {
  const list = components ?? [];
  const get = (t: string) => list.find((c) => c.types.includes(t));
  const route = get("route") && text(get("route")!) !== "Unnamed Road" ? text(get("route")!) : "";
  const number = get("street_number") ? text(get("street_number")!) : "";
  const premise = get("premise") ? text(get("premise")!) : "";
  const street = [number, route].filter(Boolean).join(" ") || premise;
  const poi = list.find((c) => c.types.includes("point_of_interest") || c.types.includes("establishment"));
  const barangay = list
    .filter((c) => c.types.some((t) => BARANGAY_TYPES.includes(t)) && !c.types.some((t) => LOCALITY_TYPES.includes(t)))
    .map(text)
    .filter(Boolean);
  return { street, landmark: poi ? text(poi) : "", barangay };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(barangay|brgy\.?|bgy\.?)\s*/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Match Google's barangay names (or the full address) to one of the café's delivery zones. */
export function matchZone<Z extends { id: string; name: string }>(zones: Z[], candidates: string[], fullText = ""): Z | null {
  for (const c of candidates) {
    const z = zones.find((z) => norm(z.name) === norm(c));
    if (z) return z;
  }
  const hay = ` ${norm(fullText)} `;
  return zones.find((z) => norm(z.name) && hay.includes(` ${norm(z.name)} `)) ?? null;
}

let token: google.maps.places.AutocompleteSessionToken | null = null;

/** Address suggestions as the customer types (biased to San Agustin, Philippines only). */
export async function suggestAddresses(input: string): Promise<Suggestion[]> {
  const g = await loadGoogleMaps();
  token ??= new g.maps.places.AutocompleteSessionToken();
  const { suggestions } = await g.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    sessionToken: token,
    includedRegionCodes: ["ph"],
    locationBias: { center: DEFAULT_CENTER, radius: 12000 },
    origin: DEFAULT_CENTER,
    language: "en",
    region: "ph",
  });
  return suggestions
    .map((s) => s.placePrediction)
    .filter((p): p is google.maps.places.PlacePrediction => !!p)
    .slice(0, 5)
    .map((p) => ({ id: p.placeId, main: p.mainText?.toString() ?? p.text.toString(), secondary: p.secondaryText?.toString() ?? "", prediction: p }));
}

/** The customer picked a suggestion → its location and address parts. */
export async function resolveSuggestion(s: Suggestion): Promise<FoundAddress> {
  const place = s.prediction.toPlace();
  await place.fetchFields({ fields: ["location", "displayName", "formattedAddress", "addressComponents", "types"] });
  token = null; // the pick ends this billing session
  const parts = readComponents(place.addressComponents as unknown as Component[]);
  const isPlace = (place.types ?? []).some((t) => t === "point_of_interest" || t === "establishment");
  const loc = place.location;
  return {
    pin: loc ? { lat: round6(loc.lat()), lng: round6(loc.lng()) } : null,
    street: parts.street || s.main,
    landmark: isPlace ? place.displayName ?? s.main : parts.landmark,
    barangay: parts.barangay,
    fullText: place.formattedAddress ?? `${s.main}, ${s.secondary}`,
  };
}

/** Pin moved → what's at that spot (to fill empty fields). */
export async function reverseGeocode(pin: LatLng): Promise<FoundAddress | null> {
  const g = await loadGoogleMaps();
  const { results } = await new g.maps.Geocoder().geocode({ location: pin });
  const usable = results.filter((r) => !r.types.includes("plus_code"));
  if (!usable.length) return null;
  const merged = usable.slice(0, 4).map((r) => readComponents(r.address_components as unknown as Component[]));
  return {
    pin,
    street: merged.find((m) => m.street)?.street ?? "",
    landmark: merged.find((m) => m.landmark)?.landmark ?? "",
    barangay: merged.flatMap((m) => m.barangay),
    fullText: usable[0].formatted_address,
  };
}

const barangayCache = new Map<string, LatLng | null>();
/** Centre of a barangay in San Agustin, Romblon (for the map before a pin is set). */
export async function locateBarangay(name: string): Promise<LatLng | null> {
  if (barangayCache.has(name)) return barangayCache.get(name)!;
  const g = await loadGoogleMaps();
  const { results } = await new g.maps.Geocoder().geocode({ address: `${name}, San Agustin, Romblon, Philippines`, region: "ph" });
  const loc = results[0]?.geometry?.location;
  const p = loc ? { lat: round6(loc.lat()), lng: round6(loc.lng()) } : null;
  barangayCache.set(name, p);
  return p;
}
