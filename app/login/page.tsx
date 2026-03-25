import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="page-shell page-card" style={{ maxWidth: 520 }}>
          Loading...
        </main>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
