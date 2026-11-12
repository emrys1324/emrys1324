import { SettingsAdmin } from "@/components/admin/SettingsAdmin";
import { requirePerm } from "@/lib/supabase/server";

export default async function Page() {
  await requirePerm("settings");
  return <SettingsAdmin />;
}
