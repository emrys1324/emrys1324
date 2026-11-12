import { redirect } from "next/navigation";
import { ALL_PERMS, firstStaffPage, isPerm, type Perm } from "@/lib/permissions";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Server-side Supabase client bound to the current user's auth cookies. */
export async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — middleware refreshes the session instead.
        }
      },
    },
  });
}

export type Role = "customer" | "admin" | "staff" | "rider";

export interface Session {
  id: string;
  email?: string;
  role: Role;
  /** effective permissions: every permission for admins, the ticked ones for staff */
  perms: Perm[];
}

/** Returns the signed-in user, their role and permissions, or null. A switched-off login has no rights. */
export async function getSessionRole(): Promise<Session | null> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const res = await supabase.from("users").select("role, is_active, permissions").eq("id", user.id).single();
  let data: { role: string; is_active?: boolean; permissions?: string[] } | null = res.data;
  if (res.error && /is_active|permissions/.test(res.error.message)) {
    // database not migrated yet (0008) — keep admins working
    data = (await supabase.from("users").select("role").eq("id", user.id).single()).data;
  }
  if (!data || data.is_active === false) return { id: user.id, email: user.email, role: "customer", perms: [] };
  const role = (data.role as Role) ?? "customer";
  const perms = role === "admin" ? ALL_PERMS : role === "staff" ? (data.permissions ?? []).filter(isPerm) : [];
  return { id: user.id, email: user.email, role, perms };
}

/** For a staff page: needs one of `perms`; otherwise goes to a page they may use (or sign-in). */
export async function requirePerm(...perms: Perm[]): Promise<Session> {
  const session = await getSessionRole();
  if (!session) redirect("/login?next=/admin");
  if (!perms.some((p) => session.perms.includes(p))) {
    const home = firstStaffPage(session.perms);
    redirect(home ? `${home}?not_allowed=1` : "/login?denied=1");
  }
  return session;
}
