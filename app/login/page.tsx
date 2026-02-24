import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 520, margin: "64px auto", padding: 16 }}>Loading…</main>}>
      <LoginClient />
    </Suspense>
  );
}
