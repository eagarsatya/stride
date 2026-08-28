import { Link2Off, Inbox } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function NotConnectedState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <Link2Off className="size-5" />
        </div>
        <div>
          <h2 className="font-medium">No data source connected</h2>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
            Connect Intervals.icu with your personal API key and Stride will pull your
            COROS runs into this dashboard.
          </p>
        </div>
        <Button asChild>
          <Link href="/settings/connections">Connect Intervals.icu</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function NoRunsState({ message }: { message?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <Inbox className="size-5" />
        </div>
        <div>
          <h2 className="font-medium">Nothing to show yet</h2>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
            {message ??
              "No runs have been synced for this range. Try a full backfill from the connections page."}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/settings/connections">Go to connections</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
