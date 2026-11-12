import { StockAdmin } from "@/components/admin/StockAdmin";
import { requirePerm } from "@/lib/supabase/server";

export default async function Page() {
  await requirePerm("stock", "menu");
  return <StockAdmin />;
}
