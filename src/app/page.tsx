// ABOUTME: Renders the dashboard layout for the personal runway workspace.
// ABOUTME: Composes spreadsheet connection, health, and manager sections.
import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireSession } from "@/server/auth/session";
import { ConnectSpreadsheetCard } from "@/components/spreadsheet/connect-spreadsheet-card";
import { BaseCurrencySelector } from "@/components/currency/base-currency-selector";
import { CategoryManager } from "@/components/categories/category-manager";
import { BudgetPlanManager } from "@/components/budget-plan/budget-plan-manager";
import { AccountsManager } from "@/components/accounts/accounts-manager";
import { SpreadsheetHealthProvider } from "@/components/spreadsheet/spreadsheet-health-context";
import { SpreadsheetHealthPanel } from "@/components/spreadsheet/spreadsheet-health-panel";
import { CashPlannerManager } from "@/components/cash-planner/cash-planner-manager";
import { RunwayTimeline } from "@/components/runway-timeline/runway-timeline";

const featureItems = [
  {
    title: "Rolling budgets",
    description:
      "Capture annual allocations per category and carry unused funds forward automatically.",
  },
  {
    title: "Balance snapshots",
    description:
      "Record the latest balances for bank accounts, digital wallets, and cash to stay grounded in reality.",
  },
  {
    title: "Future events",
    description:
      "Log upcoming income or expenses—like benefits or travel—so runway projections stay honest.",
  },
  {
    title: "Runway outlook",
    description:
      "Visualize month-by-month runway with clear green/yellow/red milestones for income, savings, and burn.",
  },
];

export default async function Home() {
  const session = await requireSession();
  const displayName = session.user?.name ?? session.user?.email ?? "Account";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-16 sm:px-10">
      <section className="flex items-center justify-between rounded-xl border border-zinc-200/70 bg-white/60 px-4 py-3 text-sm shadow-sm shadow-zinc-900/5 backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/70">
        <div className="flex flex-col">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {displayName}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Signed in with Google
          </span>
        </div>
        <SignOutButton />
      </section>

      <ConnectSpreadsheetCard />

      <SpreadsheetHealthProvider>
        <div className="flex flex-col gap-12">
          <SpreadsheetHealthPanel />

          <BaseCurrencySelector />

          <CategoryManager />

          <BudgetPlanManager />

          <CashPlannerManager />

          <AccountsManager />

          <RunwayTimeline />
        </div>
      </SpreadsheetHealthProvider>

      <section className="flex flex-col gap-6 text-balance">
        <span className="text-sm font-semibold uppercase tracking-wide accent-text">
          Personal runway planning
        </span>
        <h1 className="text-4xl font-semibold sm:text-5xl">
          Keep your 24-month cash runway clear, calm, and under control.
        </h1>
        <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-300">
          Runway Compass helps you connect a private Google Sheet to rolling
          budgets, manual actuals, and future cash events so you always know how
          many months of runway remain.
        </p>
        <div className="flex flex-wrap gap-3">
          <span className="inline-flex items-center rounded-full bg-[color:var(--color-accent-muted)] px-4 py-1 text-sm font-medium text-[color:var(--color-accent-muted-foreground)] ring-1 ring-inset ring-[color:color-mix(in_srgb,var(--color-accent)_35%,#ede9fe_65%)] dark:bg-[color:color-mix(in_srgb,var(--color-accent)_24%,#0a0a0a_76%)] dark:text-[color:color-mix(in_srgb,var(--color-accent)_78%,#ede9fe_22%)] dark:ring-[color:color-mix(in_srgb,var(--color-accent)_55%,#1f1f1f_45%)]">
            Next.js App Router
          </span>
          <span className="inline-flex items-center rounded-full bg-sky-100 px-4 py-1 text-sm font-medium text-sky-800 ring-1 ring-inset ring-sky-200">
            Google Sheets as your database
          </span>
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-4 py-1 text-sm font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
            Manual-first workflows
          </span>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        {featureItems.map((feature) => (
          <article
            key={feature.title}
            className="flex flex-col gap-2 rounded-2xl border border-zinc-200/70 bg-white/60 p-6 shadow-sm shadow-zinc-900/5 backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/70"
          >
            <h2 className="text-xl font-semibold">{feature.title}</h2>
            <p className="text-base text-zinc-600 dark:text-zinc-300">
              {feature.description}
            </p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-dashed accent-border accent-surface p-6 dark:bg-[color:color-mix(in_srgb,var(--color-accent)_22%,#0a0a0a_78%)] dark:text-[color:color-mix(in_srgb,var(--color-accent)_75%,#ede9fe_25%)]">
        <h2 className="text-lg font-semibold">Up next</h2>
        <p className="mt-2 text-base">
          Milestone 1 will introduce Google sign-in, spreadsheet selection, and
          the initial schema bootstrap so your data flows securely from day one.
        </p>
      </section>
    </main>
  );
}
