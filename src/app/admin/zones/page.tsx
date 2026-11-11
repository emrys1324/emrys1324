import { ZonesAdmin } from "@/components/admin/ZonesAdmin";
import { requireAdminPage } from "@/lib/supabase/server";

export default async function Page() {
  await requireAdminPage();
  return <ZonesAdmin />;
}
