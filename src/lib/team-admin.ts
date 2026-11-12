// Server-only helpers for the Team section (service role). Callers must be admins.
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getSessionRole } from "@/lib/supabase/server";
import { isPerm, type Perm } from "@/lib/permissions";

export type Kind = "admin" | "staff" | "rider";
export const KINDS: Kind[] = ["admin", "staff", "rider"];
const BAN_FOREVER = "876000h"; // ~100 years

export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function adminContext(): Promise<{ db: SupabaseClient; me: string } | NextResponse> {
  const session = await getSessionRole();
  if (!session || session.role !== "admin") return fail("Admins only", 403);
  const db = getAdminSupabase();
  if (!db) return fail("SUPABASE_SERVICE_ROLE_KEY is not set on the server. See README → Environment variables.", 501);
  return { db, me: session.id };
}

/** Public site address for links in invites (env first, else the request's own origin). */
export const siteUrl = (req: Request) => (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, "");
export const welcomeLink = (site: string, tokenHash: string, type: "invite" | "recovery") =>
  `${site}/welcome?token_hash=${encodeURIComponent(tokenHash)}&type=${type}`;

export const cleanPerms = (v: unknown): Perm[] => (Array.isArray(v) ? [...new Set(v.filter(isPerm))] : []);
export const cleanPhone = (v: unknown) => (typeof v === "string" ? v.replace(/[\s-]/g, "") : "");

export async function otherActiveAdmins(db: SupabaseClient, except: string) {
  const { count } = await db.from("users").select("id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true).neq("id", except);
  return count ?? 0;
}

export async function loadMember(db: SupabaseClient, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from("users").select("id, role, is_active, email, full_name").eq("id", id).single();
  return data && KINDS.includes(data.role as Kind) ? (data as { id: string; role: Kind; is_active: boolean; email: string | null; full_name: string | null }) : null;
}

export async function setLoginEnabled(db: SupabaseClient, id: string, enabled: boolean) {
  const { error } = await db.auth.admin.updateUserById(id, { ban_duration: enabled ? "none" : BAN_FOREVER });
  if (error) throw new Error(error.message);
  const { error: e2 } = await db.from("users").update({ is_active: enabled }).eq("id", id);
  if (e2) throw new Error(e2.message);
  await db.from("riders").update({ is_active: enabled }).eq("user_id", id);
}

/** Has the person followed their invite / set a password yet? */
export const inviteAccepted = (u: User | undefined) => !!(u?.last_sign_in_at || u?.email_confirmed_at);

/** Anon client, for emails Supabase sends on its own (set-password / reset). */
export const anonClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

export const friendlyEmailError = (msg: string) =>
  /rate limit|too many/i.test(msg)
    ? "Supabase's email limit was reached. Wait a bit, or use “Copy invite link” and send it by Messenger/SMS."
    : /not authorized|smtp|sending|email address/i.test(msg)
      ? `The email couldn't be sent (${msg}). Use “Copy invite link” instead, or set up email sending (docs/TEAM.md).`
      : msg;
