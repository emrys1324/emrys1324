import { redirect } from "next/navigation";
import { getSessionRole, isStaffRole } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff — Pahuway Cafe" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionRole();
  if (!session) redirect("/login?next=/admin");
  if (!isStaffRole(session.role)) redirect("/login?denied=1");
  return <AdminShell email={session.email ?? ""} role={session.role as "admin" | "staff"}>{children}</AdminShell>;
}
