import { Suspense } from "react";
import { SignInForm } from "./SignInForm";

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="landing-page min-h-screen bg-background flex items-center justify-center">
          <div className="font-mono text-sm text-muted-foreground">
            Loading…
          </div>
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
