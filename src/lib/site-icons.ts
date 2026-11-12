// Server-side: the uploaded website icons (if any), cached for a minute. Used by the page <head> and the web-app manifest.
import type { IconSet } from "./upload";

export async function getSiteIcons(): Promise<IconSet | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/store_settings?id=eq.1&select=site_icons`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 60, tags: ["site-icons"] },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { site_icons: IconSet | null }[];
    const icons = rows[0]?.site_icons;
    return icons && icons["192"] ? icons : null;
  } catch {
    return null; // e.g. build without a database, or column not there yet
  }
}
