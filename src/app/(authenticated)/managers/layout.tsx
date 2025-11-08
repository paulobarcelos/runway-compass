import { ReactNode } from "react";
import { AppProviders } from "@/components/providers/app-providers";
import { requireSession } from "@/server/auth/session";
import { createQueryClient, dehydrate } from "@/lib/query";
import { extractManagerPrefetch } from "./with-manager-prefetch";
import { ManagerChrome } from "@/components/managers";

export default async function ManagersLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const queryClient = createQueryClient();

  const spreadsheetId =
    (session.user as { spreadsheetId?: string | null } | undefined)?.spreadsheetId ?? null;

  const managerPrefetch = spreadsheetId ? extractManagerPrefetch(children) : null;

  if (spreadsheetId && managerPrefetch) {
    try {
      await managerPrefetch({ queryClient, spreadsheetId });
    } catch (error) {
      console.error("Failed to prefetch manager data", error);
    }
  }

  const dehydratedState = dehydrate(queryClient);

  return (
    <AppProviders dehydratedState={dehydratedState} session={session}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-16 sm:px-10">
        <ManagerChrome session={session} initialSpreadsheetId={spreadsheetId}>
          {children}
        </ManagerChrome>
      </main>
    </AppProviders>
  );
}
