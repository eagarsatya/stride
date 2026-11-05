"use client";

import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";

import { useBusy } from "@/components/busy-overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/action-state";

export function FitImportForm({
  importFitFiles,
}: {
  importFitFiles: (formData: FormData) => Promise<ActionState>;
}) {
  const router = useRouter();
  const { show, hide } = useBusy();
  const [pending, setPending] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const locked = useRef(false);

  function onFilesChange(event: ChangeEvent<HTMLInputElement>) {
    setFileCount(event.target.files?.length ?? 0);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;

    const form = event.currentTarget;
    const formData = new FormData(form);

    locked.current = true;
    setPending(true);
    show({
      message: "Importing FIT files…",
      detail: "Large zips can take a while. Please keep this tab open.",
    });
    try {
      const result = await importFitFiles(formData);
      if (result.status === "error") toast.error(result.message);
      else toast.success(result.message);
      form.reset();
      setFileCount(0);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Check the server logs.");
    } finally {
      hide();
      setPending(false);
      locked.current = false;
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fit-files">COROS .fit files or a .zip</Label>
        <Input
          id="fit-files"
          name="files"
          type="file"
          accept=".fit,.zip,application/zip"
          multiple
          disabled={pending}
          onChange={onFilesChange}
        />
        <p className="text-xs text-muted-foreground">
          Zip a folder of COROS .fit exports and upload it — nested folders are fine. Loose .fit
          files still work. Matching Intervals.icu runs are enriched, not duplicated. Up to 400
          activities per upload (40 MB zip).
        </p>
      </div>

      <Button type="submit" disabled={pending || fileCount === 0}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {pending
          ? "Importing…"
          : fileCount > 0
            ? `Import ${fileCount} file${fileCount === 1 ? "" : "s"}`
            : "Import"}
      </Button>
    </form>
  );
}
