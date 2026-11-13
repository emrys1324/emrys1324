import { Suspense } from "react";
import { BookingStatusScreen } from "@/components/customer/BookingStatusScreen";
import { PageLoader } from "@/components/ui";

export const metadata = { title: "Your scooter booking — Padaya" };

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Suspense fallback={<PageLoader />}>
      <BookingStatusScreen token={token} />
    </Suspense>
  );
}
