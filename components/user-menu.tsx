"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useBusy } from "@/components/busy-overlay";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserMenu({
  name,
  email,
  image,
}: {
  name: string;
  email: string;
  image?: string | null;
}) {
  const router = useRouter();
  const { show, hide } = useBusy();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    if (pending) return;
    setPending(true);
    show({ message: "Signing out…" });
    const { error } = await signOut();
    if (error) {
      hide();
      setPending(false);
      toast.error(error.message ?? "Could not sign out.");
      return;
    }
    router.push("/");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
          <Avatar className="size-8">
            {image ? <AvatarImage src={image} alt="" /> : null}
            <AvatarFallback className="text-xs">{initials(name || email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-muted-foreground truncate text-xs">{email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/connections">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onSelect={(e) => e.preventDefault()}>
          <button
            type="button"
            className="flex w-full items-center gap-2"
            onClick={handleSignOut}
          >
            <LogOut className="size-4" />
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
