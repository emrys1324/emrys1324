import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Staff sign in — Padaya" };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
