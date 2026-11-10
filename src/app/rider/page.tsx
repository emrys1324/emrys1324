import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/supabase/server";
import { RiderScreen } from "./RiderScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "My deliveries — Pahuway Cafe" };

export default async function RiderPage() {
  const session = await getSessionRole();
  if (!session) redirect("/login?next=/rider");
  if (session.role !== "rider") redirect("/login?denied=1");
  return <RiderScreen />;
}
