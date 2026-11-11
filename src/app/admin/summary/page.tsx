import { SummaryAdmin } from "@/components/admin/SummaryAdmin";
import { requireAdminPage } from "@/lib/supabase/server";

export default async function Page() {
  await requireAdminPage();
  return <SummaryAdmin />;
}
