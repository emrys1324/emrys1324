import { OptionsAdmin } from "@/components/admin/OptionsAdmin";
import { requirePerm } from "@/lib/supabase/server";

export default async function Page() {
  await requirePerm("menu");
  return <OptionsAdmin />;
}
