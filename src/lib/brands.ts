// Three brands share this site: the welcome (home) page, Pahuway Cafe and Baybayin scooter rental.
// Each has its own header title, tagline, logo and colour; unset values fall back sensibly.
import type { StoreSettings } from "./types";

export type BrandKey = "site" | "cafe" | "baybayin";
export interface Brand {
  key: BrandKey;
  name: string;
  tagline: string;
  logo: string | null; // null = show the emoji instead
  emoji: string;
  color: string | null; // null = default cream header
}

export const DEFAULT_LOGO = "/logo.svg";
export const DEFAULTS = {
  cafeName: "Pahuway Cafe",
  cafeTagline: "San Agustin, Romblon",
  baybayinName: "Baybayin",
  baybayinTagline: "Scooter rental · San Agustin",
  welcomeTitle: "Welcome!",
  welcomeSubtitle: "What would you like to do today?",
  cafeCard: "Coffee, drinks & food · pickup, dine-in or delivery",
  baybayinCard: "Scooter rentals for getting around San Agustin. Check back soon!",
};

/** Text setting: null/undefined → fallback; blank names fall back too. */
const name = (v: string | null | undefined, fallback: string) => v?.trim() || fallback;
/** Same rule for every text: empty means "use the default". */
const line = name;

export function brandOf(s: StoreSettings | null | undefined, key: BrandKey): Brand {
  const cafe: Brand = {
    key: "cafe",
    name: name(s?.store_name, DEFAULTS.cafeName),
    tagline: line(s?.store_tagline, DEFAULTS.cafeTagline),
    logo: s?.logo_url || DEFAULT_LOGO,
    emoji: "☕",
    color: s?.header_color ?? null,
  };
  if (key === "cafe") return cafe;
  if (key === "site")
    return {
      key: "site",
      name: name(s?.site_name, cafe.name),
      tagline: line(s?.site_tagline, cafe.tagline),
      logo: s?.site_logo_url || cafe.logo,
      emoji: "☕",
      color: s?.site_header_color ?? cafe.color,
    };
  return {
    key: "baybayin",
    name: name(s?.baybayin_name, DEFAULTS.baybayinName),
    tagline: line(s?.baybayin_tagline, DEFAULTS.baybayinTagline),
    logo: s?.baybayin_logo_url || null,
    emoji: "🛵",
    color: s?.baybayin_header_color ?? null,
  };
}

export function welcomeTexts(s: StoreSettings | null | undefined) {
  return {
    title: name(s?.welcome_title, DEFAULTS.welcomeTitle),
    subtitle: line(s?.welcome_subtitle, DEFAULTS.welcomeSubtitle),
    cafeCard: line(s?.cafe_card_text, DEFAULTS.cafeCard),
    baybayinCard: line(s?.baybayin_card_text, DEFAULTS.baybayinCard),
  };
}
