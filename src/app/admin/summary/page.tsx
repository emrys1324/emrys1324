import { SummaryAdmin } from "@/components/admin/SummaryAdmin";
import { requirePerm } from "@/lib/supabase/server";

export default async function Page() {
  await requirePerm("sales");
  return <SummaryAdmin />;
}
