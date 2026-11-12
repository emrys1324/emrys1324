import { RentalsAdmin } from "@/components/admin/RentalsAdmin";
import { requirePerm } from "@/lib/supabase/server";

export default async function Page() {
  await requirePerm("rentals");
  return <RentalsAdmin />;
}
