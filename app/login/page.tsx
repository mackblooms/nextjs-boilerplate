import { Suspense } from "react";
import LoginClient from "./LoginClient";
import { UiLoadingState } from "../components/ui/primitives";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="page-shell page-card" style={{ maxWidth: 520 }}>
          <UiLoadingState
            title="loading login"
            description="preparing your sign in options."
          />
        </main>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
