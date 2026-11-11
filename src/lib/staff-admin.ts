// Server-only helpers for managing staff logins (service role). Admin-only callers.
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getSessionRole } from "@/lib/supabase/server";

export type Access = "admin" | "staff";
export const ACCESS: Access[] = ["admin", "staff"];
const BAN_FOREVER = "876000h"; // ~100 years

export async function adminContext(): Promise<{ db: SupabaseClient; me: string } | NextResponse> {
  const session = await getSessionRole();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const db = getAdminSupabase();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server. See README → Environment variables." }, { status: 501 });
  return { db, me: session.id };
}

export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Number of active admins other than `except`. */
export async function otherActiveAdmins(db: SupabaseClient, except: string) {
  const { count } = await db.from("users").select("id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true).neq("id", except);
  return count ?? 0;
}

export async function setLoginEnabled(db: SupabaseClient, id: string, enabled: boolean) {
  const { error } = await db.auth.admin.updateUserById(id, { ban_duration: enabled ? "none" : BAN_FOREVER });
  if (error) throw new Error(error.message);
  const { error: e2 } = await db.from("users").update({ is_active: enabled }).eq("id", id);
  if (e2) throw new Error(e2.message);
}

export function validPassword(p: unknown): p is string {
  return typeof p === "string" && p.length >= 8 && p.length <= 72;
}
