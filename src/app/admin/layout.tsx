import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff — Padaya" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionRole();
  if (!session) redirect("/login?next=/admin");
  if (session.perms.length === 0) redirect("/login?denied=1");
  return (
    <AdminShell email={session.email ?? ""} perms={session.perms} isAdmin={session.role === "admin"}>
      {children}
    </AdminShell>
  );
}
