import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <Card className={cn("bg-card/60", className)}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <p className="text-muted-foreground text-sm font-medium">{label}</p>
          {Icon ? <Icon className="text-muted-foreground size-4 shrink-0" /> : null}
        </div>
        <p className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
