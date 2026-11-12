import { ZonesAdmin } from "@/components/admin/ZonesAdmin";
import { requirePerm } from "@/lib/supabase/server";

export default async function Page() {
  await requirePerm("zones");
  return <ZonesAdmin />;
}
