import { createClient } from "@supabase/supabase-js";

/** Service-role client for trusted server routes (bypasses RLS). Never import in client code. */
export function getAdminSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
