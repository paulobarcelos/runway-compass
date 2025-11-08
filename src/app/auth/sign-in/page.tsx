// ABOUTME: Presents authentication entry screen for Google sign-in.
// ABOUTME: Redirects authenticated users back to the application shell.
import { redirect } from "next/navigation";

import { SignInButton } from "@/components/auth/sign-in-button";
import { AppProviders } from "@/components/providers/app-providers";
import { getSession } from "@/server/auth/session";

export default async function SignInPage() {
  const session = await getSession();

  if (session) {
    redirect("/");
  }

  return (
    <AppProviders dehydratedState={undefined} session={session}>
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-10 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-2 text-center">
          <span className="text-sm font-semibold uppercase tracking-wide accent-text">
            Runway Compass
          </span>
          <h1 className="text-3xl font-semibold sm:text-4xl">
            Sign in to connect your spreadsheet.
          </h1>
          <p className="text-base text-zinc-600 dark:text-zinc-300">
            Use your Google Account to authorize secure access to Drive and Sheets.
          </p>
        </header>

        <div className="rounded-2xl border border-zinc-200/70 bg-white/60 p-8 shadow-sm shadow-zinc-900/5 backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/70">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Google sign-in required
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            We request Drive and Sheets permissions to create and sync your Runway
            Compass workbook. Access is limited to files created or selected by
            you.
          </p>
          <SignInButton />
        </div>
      </main>
    </AppProviders>
  );
}
