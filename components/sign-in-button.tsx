"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useBusy } from "@/components/busy-overlay";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.85 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.67-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.67 2.84c.86-2.6 3.29-4.51 6.15-4.51Z"
      />
    </svg>
  );
}

export function SignInButton({
  callbackURL = "/dashboard",
  size = "lg",
  className,
}: {
  callbackURL?: string;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  const { show, hide } = useBusy();
  const [pending, setPending] = useState(false);

  async function handleSignIn() {
    if (pending) return;
    setPending(true);
    show({ message: "Redirecting to Google…" });
    const { error } = await signIn.social({ provider: "google", callbackURL });

    // A successful call navigates away, so only failures land back here.
    if (error) {
      hide();
      setPending(false);
      toast.error(error.message ?? "Could not start Google sign-in.");
    }
  }

  return (
    <Button size={size} className={className} disabled={pending} onClick={handleSignIn}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <GoogleIcon className="size-4" />
      )}
      Continue with Google
    </Button>
  );
}
