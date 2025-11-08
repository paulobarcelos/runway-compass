// ABOUTME: Renders the dashboard shell with CTA cards pointing to each manager route.
import Link from "next/link";
import { AppProviders } from "@/components/providers/app-providers";
import { createQueryClient, dehydrate } from "@/lib/query";
import { requireSession } from "@/server/auth/session";
import { ManagerChrome } from "@/components/managers";

export default async function Home() {
  const session = await requireSession();
  const queryClient = createQueryClient();
  const spreadsheetId =
    (session.user as { spreadsheetId?: string | null } | undefined)?.spreadsheetId ?? null;
  const dehydratedState = dehydrate(queryClient);

  return (
    <AppProviders dehydratedState={dehydratedState} session={session}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-16 sm:px-10">
        <ManagerChrome session={session} initialSpreadsheetId={spreadsheetId}>
          <div className="grid gap-6">
            {[
              {
                title: "Categories",
                description: "Reorder, color, and autosave your budgeting categories.",
                href: "/managers/categories",
                button: "Open categories",
              },
              {
                title: "Accounts",
                description: "Review balances, snapshots, and spreadsheet diagnostics.",
                href: "/managers/accounts",
                button: "Open accounts",
              },
              {
                title: "Budget plan",
                description: "Edit horizon settings and tweak the budget grid with autosave.",
                href: "/managers/budget-plan",
                button: "Open budget plan",
              },
              {
                title: "Ledger",
                description: "Capture cash planner entries and monitor cash flow timing.",
                href: "/managers/ledger",
                button: "Open ledger",
              },
              {
                title: "Runway timeline",
                description: "Preview the upcoming runway experience (placeholder).",
                href: "/managers/runway",
                button: "Open runway",
              },
            ].map((card) => (
              <section
                key={card.href}
                className="rounded-2xl border border-dashed border-zinc-200/80 bg-zinc-50/70 p-6 text-sm text-zinc-700 shadow-inner shadow-white/40 dark:border-zinc-700/60 dark:bg-zinc-950/50 dark:text-zinc-200"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{card.title}</p>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{card.description}</p>
                  </div>
                  <Link
                    href={card.href}
                    className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {card.button}
                  </Link>
                </div>
              </section>
            ))}
          </div>
        </ManagerChrome>
      </main>
    </AppProviders>
  );
}
