"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "./supabase/client";

/**
 * First name of the signed-in person (from their profile, else sign-up details).
 * undefined while checking, null when signed out.
 */
export function useFirstName(): string | null | undefined {
  const [name, setName] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const db = getSupabase();
    let active = true;
    const load = async (uid: string | null, meta?: Record<string, unknown>) => {
      if (!uid) return active && setName(null);
      const { data } = await db.from("users").select("full_name").eq("id", uid).maybeSingle();
      const full = ((data?.full_name as string | null) || (meta?.full_name as string | undefined) || "").trim();
      if (active) setName(full ? full.split(/\s+/)[0] : null);
    };
    db.auth.getUser().then(({ data }) => load(data.user?.id ?? null, data.user?.user_metadata));
    const { data: sub } = db.auth.onAuthStateChange((_e, session) => load(session?.user?.id ?? null, session?.user?.user_metadata));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return name;
}
