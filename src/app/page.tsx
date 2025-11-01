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

    </main>
  );
}
