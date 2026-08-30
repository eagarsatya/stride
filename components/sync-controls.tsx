"use client";

import { History, Loader2, RefreshCw, Trash2, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";

type Variant = "default" | "outline" | "ghost" | "destructive" | "secondary";

function ActionButton({
  action,
  children,
  icon,
  variant = "outline",
  confirm,
}: {
  action: () => Promise<ActionState>;
  children: ReactNode;
  icon: ReactNode;
  variant?: Variant;
  confirm?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run() {
    if (confirm && !window.confirm(confirm)) return;

    setPending(true);
    try {
      const result = await action();
      if (result.status === "error") toast.error(result.message);
      else toast.success(result.message);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Check the server logs.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant={variant} disabled={pending} onClick={run}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </Button>
  );
}

export function SyncControls({
  onSyncNow,
  onBackfill,
}: {
  onSyncNow: () => Promise<ActionState>;
  onBackfill: () => Promise<ActionState>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton action={onSyncNow} icon={<RefreshCw className="size-4" />} variant="default">
        Sync now
      </ActionButton>
      <ActionButton action={onBackfill} icon={<History className="size-4" />}>
        Backfill 3 years
      </ActionButton>
    </div>
  );
}

export function DangerControls({
  onDisconnect,
  onDeleteAll,
}: {
  onDisconnect: () => Promise<ActionState>;
  onDeleteAll: () => Promise<ActionState>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        action={onDisconnect}
        icon={<Unplug className="size-4" />}
        confirm="Remove the stored Intervals.icu key? Your synced runs will be kept."
      >
        Disconnect
      </ActionButton>
      <ActionButton
        action={onDeleteAll}
        icon={<Trash2 className="size-4" />}
        variant="destructive"
        confirm="Delete every synced run, stream and wellness record? This cannot be undone."
      >
        Delete synced data
      </ActionButton>
    </div>
  );
}
