import { Suspense } from "react";
import { WelcomeForm } from "./WelcomeForm";

export const metadata = { title: "Set your password — Pahuway Cafe" };

export default function WelcomePage() {
  return (
    <Suspense>
      <WelcomeForm />
    </Suspense>
  );
}
