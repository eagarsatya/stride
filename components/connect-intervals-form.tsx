"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { connectIntervals } from "@/app/(app)/settings/connections/actions";
import { useBusyEffect } from "@/components/busy-overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IDLE } from "@/lib/action-state";

export function ConnectIntervalsForm({ connected }: { connected: boolean }) {
  const [state, formAction, pending] = useActionState(connectIntervals, IDLE);
  useBusyEffect(pending, { message: "Verifying API key…" });

  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error") toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="apiKey">Intervals.icu API key</Label>
        <Input
          id="apiKey"
          name="apiKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          placeholder={connected ? "Paste a new key to replace the stored one" : "e.g. 6dzmsans11bsyifjxchr87oum"}
        />
        <p className="text-muted-foreground text-xs">
          Find it at{" "}
          <a
            href="https://intervals.icu/settings"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground inline-flex items-center gap-1 underline underline-offset-4"
          >
            intervals.icu/settings
            <ExternalLink className="size-3" />
          </a>{" "}
          under Developer Settings. The key is encrypted before it is stored and is never
          sent back to your browser.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "Verifying…" : connected ? "Replace key" : "Connect"}
      </Button>

      {state.status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
