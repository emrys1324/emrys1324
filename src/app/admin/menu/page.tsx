import { MenuAdmin } from "@/components/admin/MenuAdmin";
import { requirePerm } from "@/lib/supabase/server";

export default async function Page() {
  await requirePerm("menu");
  return <MenuAdmin />;
}
