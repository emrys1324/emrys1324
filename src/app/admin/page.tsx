import { OrdersBoard } from "@/components/admin/OrdersBoard";
import { requirePerm } from "@/lib/supabase/server";

export default async function AdminOrdersPage() {
  await requirePerm("orders");
  return <OrdersBoard />;
}
