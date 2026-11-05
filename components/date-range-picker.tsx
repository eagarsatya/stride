"use client";

import { CalendarIcon, ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type DateRange } from "react-day-picker";
import { enGB } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format";
import { isoDay, parseIsoDay } from "@/lib/queries";
import { cn } from "@/lib/utils";

function toLocalDate(iso: string | null): Date | undefined {
  const day = parseIsoDay(iso);
  if (!day) return undefined;
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

function rangeLabel(from: string | null, to: string | null): string {
  if (from && to) return `${formatDate(toLocalDate(from))} – ${formatDate(toLocalDate(to))}`;
  if (from) return `From ${formatDate(toLocalDate(from))}`;
  if (to) return `Until ${formatDate(toLocalDate(to))}`;
  return "Pick dates";
}

export function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string | null;
  to: string | null;
  onChange: (range: { from: string | null; to: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const today = useMemo(() => new Date(), []);
  const startMonth = useMemo(() => new Date(today.getFullYear() - 5, 0, 1), [today]);

  useEffect(() => {
    if (!open) return;
    setDraft({
      from: toLocalDate(from),
      to: toLocalDate(to),
    });
  }, [open, from, to]);

  const empty = !from && !to;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label="Custom date range"
          data-empty={empty}
          className={cn(
            "h-8 min-w-56 justify-between px-2.5 font-normal",
            empty && "text-muted-foreground",
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <CalendarIcon className="text-muted-foreground size-4" />
            <span className="truncate">{rangeLabel(from, to)}</span>
          </span>
          <ChevronDownIcon className="text-muted-foreground size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="range"
          locale={enGB}
          captionLayout="dropdown"
          numberOfMonths={2}
          resetOnSelect
          selected={draft}
          defaultMonth={toLocalDate(from) ?? toLocalDate(to) ?? today}
          startMonth={startMonth}
          endMonth={today}
          disabled={{ after: today }}
          onSelect={(next) => {
            setDraft(next);
            if (!next?.from || !next.to) return;
            onChange({ from: isoDay(next.from), to: isoDay(next.to) });
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
