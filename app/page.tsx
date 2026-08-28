import { Activity, KeyRound, LineChart, Map, RefreshCw, Trophy } from "lucide-react";
import { redirect } from "next/navigation";

import { SignInButton } from "@/components/sign-in-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getSession } from "@/lib/session";

const features = [
  {
    icon: LineChart,
    title: "Volume and load",
    body: "Weekly mileage, training load, and the fitness/fatigue/form curve built from every synced run.",
  },
  {
    icon: Activity,
    title: "Pace and heart rate",
    body: "Per-run splits, zone distribution, and aerobic decoupling to see whether easy days stayed easy.",
  },
  {
    icon: Trophy,
    title: "Personal records",
    body: "Fastest 1K, 5K, 10K, half, and marathon efforts surfaced automatically from your history.",
  },
  {
    icon: Map,
    title: "Route maps",
    body: "GPS traces rendered per activity, pulled on demand so the dashboard stays fast.",
  },
  {
    icon: RefreshCw,
    title: "Nightly sync",
    body: "A scheduled job pulls new activities and re-checks recent ones in case they were edited.",
  },
  {
    icon: KeyRound,
    title: "Your key, encrypted",
    body: "Your Intervals.icu API key is encrypted with AES-256-GCM before it touches the database.",
  },
];

const steps = [
  {
    step: "01",
    title: "Sync COROS to Intervals.icu",
    body: "In Intervals.icu, open Settings → Connections and authorize COROS. Connect from Intervals, not from the COROS app.",
  },
  {
    step: "02",
    title: "Paste your API key",
    body: "Generate a personal API key under Intervals.icu Settings → Developer Settings and paste it into Stride once.",
  },
  {
    step: "03",
    title: "Watch it backfill",
    body: "Stride pulls up to three years of running history, then keeps itself current every night.",
  },
];

export default async function Home() {
  const session = await getSession();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <Activity className="size-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Stride</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <SignInButton size="sm" />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="from-primary/20 pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-b to-transparent blur-3xl"
          />
          <div className="relative mx-auto w-full max-w-6xl px-6 pt-16 pb-24 text-center">
            <Badge variant="secondary" className="mb-6">
              COROS → Intervals.icu → your own database
            </Badge>
            <h1 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
              Your running data, finally somewhere you control.
            </h1>
            <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg text-pretty">
              Stride pulls every run off your COROS watch through Intervals.icu, stores it in
              your own Postgres database, and turns it into the dashboard the stock apps never
              gave you.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3">
              <SignInButton />
              <p className="text-muted-foreground text-xs">
                Free to run. No Strava subscription required.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-border/60 bg-muted/30 border-y">
          <div className="mx-auto w-full max-w-6xl px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">Three steps to set up</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {steps.map(({ step, title, body }) => (
                <div key={step} className="relative">
                  <span className="text-primary/30 font-mono text-4xl font-semibold">
                    {step}
                  </span>
                  <h3 className="mt-2 font-medium">{title}</h3>
                  <p className="text-muted-foreground mt-1.5 text-sm">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight">What you get</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="bg-card/50">
                <CardContent className="pt-6">
                  <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
                    <Icon className="size-4.5" />
                  </div>
                  <h3 className="mt-4 font-medium">{title}</h3>
                  <p className="text-muted-foreground mt-1.5 text-sm">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-border/60 border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-8 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>Stride — a personal running dashboard.</p>
          <p>
            Activity data via{" "}
            <a
              href="https://intervals.icu"
              className="hover:text-foreground underline underline-offset-4"
              target="_blank"
              rel="noreferrer"
            >
              Intervals.icu
            </a>
            . Not affiliated with COROS.
          </p>
        </div>
      </footer>
    </div>
  );
}
