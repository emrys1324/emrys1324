import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff — Pahuway Cafe" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionRole();
  if (!session) redirect("/login?next=/admin");
  if (session.role !== "admin") redirect("/login?denied=1");
  return <AdminShell email={session.email ?? ""}>{children}</AdminShell>;
}
