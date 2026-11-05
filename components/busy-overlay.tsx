"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export type BusyOptions = {
  message: string;
  detail?: string;
  progress?: number;
  onCancel?: () => void;
};

type BusyContextValue = {
  show: (options: BusyOptions) => void;
  hide: () => void;
  update: (options: Partial<BusyOptions>) => void;
};

const BusyContext = createContext<BusyContextValue | null>(null);

export function useBusy() {
  const ctx = useContext(BusyContext);
  if (!ctx) {
    throw new Error("useBusy must be used within BusyProvider");
  }
  return ctx;
}

/** Show the overlay while `pending` is true; hide it again on the way out. */
export function useBusyEffect(pending: boolean, options: BusyOptions) {
  const { show, hide } = useBusy();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!pending) return;
    show(optionsRef.current);
    return () => hide();
  }, [pending, show, hide]);
}

export function BusyProvider({ children }: { children: ReactNode }) {
  const countRef = useRef(0);
  const [busy, setBusy] = useState<BusyOptions | null>(null);

  const show = useCallback((options: BusyOptions) => {
    countRef.current += 1;
    setBusy(options);
  }, []);

  const hide = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1);
    if (countRef.current === 0) setBusy(null);
  }, []);

  const update = useCallback((options: Partial<BusyOptions>) => {
    setBusy((current) => (current ? { ...current, ...options } : current));
  }, []);

  const value = useMemo(() => ({ show, hide, update }), [show, hide, update]);

  return (
    <BusyContext.Provider value={value}>
      {children}
      {busy ? (
        <BusyOverlay
          message={busy.message}
          detail={busy.detail}
          progress={busy.progress}
          onCancel={busy.onCancel}
        />
      ) : null}
      <Suspense fallback={null}>
        <NavigationBusy />
      </Suspense>
    </BusyContext.Provider>
  );
}

function BusyOverlay({
  message,
  detail,
  progress,
  onCancel,
}: {
  message: string;
  detail?: string;
  progress?: number;
  onCancel?: () => void;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="busy-overlay-title"
      aria-describedby={detail ? "busy-overlay-detail" : undefined}
      className="bg-background/70 fixed inset-0 z-[80] flex cursor-wait items-center justify-center backdrop-blur-[2px]"
    >
      <div className="bg-card text-card-foreground border-border flex min-w-[16rem] max-w-sm flex-col items-center gap-3 rounded-xl border px-6 py-5 shadow-lg">
        <Loader2 className="text-primary size-6 animate-spin" />
        <div className="w-full text-center">
          <p id="busy-overlay-title" className="text-sm font-medium">
            {message}
          </p>
          {detail ? (
            <p id="busy-overlay-detail" className="text-muted-foreground mt-1 text-xs">
              {detail}
            </p>
          ) : null}
        </div>
        {progress != null ? <Progress value={progress} className="w-full" /> : null}
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer"
            onClick={onCancel}
          >
            Stop
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function NavigationBusy() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { show, hide } = useBusy();
  const shownRef = useRef(false);
  const timeoutRef = useRef(0);

  useEffect(() => {
    window.clearTimeout(timeoutRef.current);
    if (shownRef.current) {
      hide();
      shownRef.current = false;
    }
  }, [pathname, search, hide]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (url.pathname === pathname && url.search.replace(/^\?/, "") === search) return;

      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        show({ message: "Loading…" });
        shownRef.current = true;
      }, 150);
    }

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      window.clearTimeout(timeoutRef.current);
    };
  }, [pathname, search, show]);

  return null;
}
