import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/supabase/server";
import { RiderScreen } from "./RiderScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "My deliveries — Padaya" };

export default async function RiderPage() {
  const session = await getSessionRole();
  if (!session) redirect("/rider/login");
  if (session.role !== "rider") redirect("/rider/login?denied=1");
  return <RiderScreen />;
}
