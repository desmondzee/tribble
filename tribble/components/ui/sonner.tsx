"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      toastOptions={{
        classNames: {
          toast: "bg-popover border-border text-popover-foreground",
          success: "border-green-500/50",
          error: "border-destructive/50",
        },
      }}
    />
  );
}
