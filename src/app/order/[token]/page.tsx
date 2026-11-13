import { OrderStatusScreen } from "@/components/customer/OrderStatusScreen";

export const metadata = { title: "Your order — Padaya" };

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OrderStatusScreen token={token} />;
}
