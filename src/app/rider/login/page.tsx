import { Suspense } from "react";
import { RiderLoginForm } from "./RiderLoginForm";

export const metadata = { title: "Rider sign in — Padaya" };

export default function RiderLoginPage() {
  return (
    <Suspense>
      <RiderLoginForm />
    </Suspense>
  );
}
