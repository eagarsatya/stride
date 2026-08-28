import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  await requireUser();

  return (
    <>
      <PageHeader title="Overview" description="Your running at a glance." />
      <p className="text-muted-foreground text-sm">Charts land in a later step.</p>
    </>
  );
}
