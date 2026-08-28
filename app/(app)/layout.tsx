import { Activity } from "lucide-react";
import Link from "next/link";

import { AppNav } from "@/components/app-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-background/80 border-border/60 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
            <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
              <Activity className="size-4" />
            </div>
            <span className="hidden text-base font-semibold tracking-tight sm:inline">
              Stride
            </span>
          </Link>
          <div className="min-w-0 flex-1">
            <AppNav />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} image={user.image} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
