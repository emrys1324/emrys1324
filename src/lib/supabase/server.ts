import { redirect } from "next/navigation";
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

/** Returns the signed-in user and their role, or null. */
export async function getSessionRole(): Promise<{ id: string; email?: string; role: Role } | null> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const res = await supabase.from("users").select("role, is_active").eq("id", user.id).single();
  let data: { role: string; is_active?: boolean } | null = res.data;
  if (res.error && /is_active/.test(res.error.message)) {
    // database not migrated yet (0008) — keep admins working
    data = (await supabase.from("users").select("role").eq("id", user.id).single()).data;
  }
  // a deactivated login gets no staff/admin/rider rights
  const role = data && data.is_active !== false ? ((data.role as Role) ?? "customer") : "customer";
  return { id: user.id, email: user.email, role };
}

/** Staff area access: full admins and "Orders only" staff. */
export const isStaffRole = (r: Role | undefined) => r === "admin" || r === "staff";

/** For admin-only pages: staff are sent back to the orders board. */
export async function requireAdminPage() {
  const session = await getSessionRole();
  if (!session) redirect("/login?next=/admin");
  if (session.role !== "admin") redirect("/admin?admin_only=1");
  return session;
}
