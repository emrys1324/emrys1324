import { MenuAdmin } from "@/components/admin/MenuAdmin";
import { requireAdminPage } from "@/lib/supabase/server";

export default async function Page() {
  await requireAdminPage();
  return <MenuAdmin />;
}
