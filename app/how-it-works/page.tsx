import { Suspense } from "react";
import HowItWorksClient from "./HowItWorksClient";

export default function HowItWorksPage() {
  return (
    <Suspense fallback={null}>
      <HowItWorksClient />
    </Suspense>
  );
}
