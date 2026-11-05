"use client";

import { useTransition } from "react";

import { setDistanceUnit } from "@/app/(app)/settings/connections/actions";
import { Button } from "@/components/ui/button";
import type { DistanceUnit } from "@/lib/units";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ unit: DistanceUnit; label: string; hint: string }> = [
  { unit: "km", label: "Kilometres", hint: "km · min/km · m" },
  { unit: "mi", label: "Miles", hint: "mi · min/mi · ft" },
];

export function UnitsForm({ value }: { value: DistanceUnit }) {
  const [pending, startTransition] = useTransition();

  function select(unit: DistanceUnit) {
    if (unit === value || pending) return;
    startTransition(() => {
      void setDistanceUnit(unit);
    });
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {OPTIONS.map((option) => {
        const active = option.unit === value;
        return (
          <Button
            key={option.unit}
            type="button"
            variant={active ? "default" : "outline"}
            disabled={pending}
            aria-pressed={active}
            onClick={() => select(option.unit)}
            className={cn("h-auto flex-col items-start gap-0.5 px-3 py-2.5 whitespace-normal")}
          >
            <span className="text-sm font-medium">{option.label}</span>
            <span className={cn("text-xs font-normal", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {option.hint}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
