"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Browser Supabase client (singleton). Created lazily so builds don't need env vars. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. See README → Setup.");
  }
  client = createBrowserClient(url, key);
  return client;
}

/**
 * Browser client whose realtime connection carries the signed-in user's token.
 * Staff/rider channels must use this: if a channel joins before the session is
 * loaded it joins as anonymous, and row-level security then silently filters
 * out every order event (the board looks "Live" but misses new orders).
 */
export async function getAuthedSupabase(): Promise<SupabaseClient> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  if (data.session) await supabase.realtime.setAuth(data.session.access_token);
  return supabase;
}
