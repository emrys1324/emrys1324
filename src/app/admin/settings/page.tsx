import { SettingsAdmin } from "@/components/admin/SettingsAdmin";
import { requireAdminPage } from "@/lib/supabase/server";

export default async function Page() {
  await requireAdminPage();
  return <SettingsAdmin />;
}
