import { StaffAdmin } from "@/components/admin/StaffAdmin";
import { requireAdminPage } from "@/lib/supabase/server";

export default async function Page() {
  await requireAdminPage();
  return <StaffAdmin />;
}
