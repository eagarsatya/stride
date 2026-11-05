"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { analyzeRuns } from "@/app/(app)/records/actions";
import { useBusy } from "@/components/busy-overlay";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

/** Stop after this many batches so a runaway loop cannot hammer the API. */
const MAX_BATCHES = 60;

export function AnalyzeRunsButton({ pending: initialPending }: { pending: number }) {
  const router = useRouter();
  const { show, hide, update } = useBusy();
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(initialPending);
  const [done, setDone] = useState(0);
  const cancelled = useRef(false);

  const total = initialPending || 1;

  async function start() {
    if (running) return;

    setRunning(true);
    setDone(0);
    cancelled.current = false;
    show({
      message: "Analyzing runs…",
      detail: `0 of ${total}`,
      progress: 0,
      onCancel: () => {
        cancelled.current = true;
        update({ message: "Stopping…", onCancel: undefined });
      },
    });

    let analyzedTotal = 0;

    try {
      for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
        if (cancelled.current) break;

        const result = await analyzeRuns();

        if (result.status === "error") {
          toast.error(result.message ?? "Analysis failed.");
          break;
        }

        analyzedTotal += result.analyzed;
        setDone(analyzedTotal);
        setRemaining(result.remaining);
        update({
          detail: `${analyzedTotal} of ${total} analyzed · ${result.remaining} remaining`,
          progress: Math.min(100, (analyzedTotal / total) * 100),
        });

        // Nothing left, or nothing could be processed -- either way, stop.
        if (result.remaining === 0 || result.analyzed === 0) break;
      }
    } finally {
      hide();
      setRunning(false);
      router.refresh();
    }

    if (!cancelled.current) {
      toast.success(`Analyzed ${analyzedTotal} runs.`);
    }
  }

  if (remaining === 0 && !running) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={start} disabled={running}>
          {running ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {running ? "Analyzing…" : `Analyze ${remaining} runs`}
        </Button>
        {running ? (
          <Button
            variant="outline"
            onClick={() => {
              cancelled.current = true;
            }}
          >
            Stop
          </Button>
        ) : null}
      </div>

      {running ? (
        <div className="space-y-1">
          <Progress value={(done / total) * 100} />
          <p className="text-muted-foreground text-xs">
            {done} of {total} analyzed · {remaining} remaining. Each run needs one
            Intervals.icu request, so this is deliberately paced.
          </p>
        </div>
      ) : null}
    </div>
  );
}
