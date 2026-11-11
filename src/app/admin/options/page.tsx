import { OptionsAdmin } from "@/components/admin/OptionsAdmin";
import { requireAdminPage } from "@/lib/supabase/server";

export default async function Page() {
  await requireAdminPage();
  return <OptionsAdmin />;
}
