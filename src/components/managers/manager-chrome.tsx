"use client";

import { useEffect, useState } from "react";

import type { ReactNode } from "react";
import type { ManifestRecord } from "@/lib/manifest-store";
import type { Session } from "next-auth";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { ManagerNavigation } from "@/components/navigation/manager-navigation";
import { loadManifest, manifestStorageKey } from "@/lib/manifest-store";
import { subscribeToManifestChange } from "@/lib/manifest-events";
import { ConnectSpreadsheetCard } from "@/components/spreadsheet/connect-spreadsheet-card";
import { SpreadsheetHealthProvider } from "@/components/spreadsheet/spreadsheet-health-context";
import { SpreadsheetHealthPanel } from "@/components/spreadsheet/spreadsheet-health-panel";
import { BaseCurrencySelector } from "@/components/currency/base-currency-selector";

interface ManagerChromeProps {
  session: Session;
  initialSpreadsheetId: string | null;
  children: ReactNode;
}

export function ManagerChrome({ session, initialSpreadsheetId, children }: ManagerChromeProps) {
  const displayName = session.user?.name ?? session.user?.email ?? "Account";
  const [effectiveSpreadsheetId, setEffectiveSpreadsheetId] = useState<string | null>(
    initialSpreadsheetId ?? null,
  );

  useEffect(() => {
    setEffectiveSpreadsheetId(initialSpreadsheetId ?? null);
  }, [initialSpreadsheetId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncFromStorage = () => {
      const manifest = loadManifest(window.localStorage);
      setEffectiveSpreadsheetId(manifest?.spreadsheetId ?? null);
    };

    syncFromStorage();

    const unsubscribe = subscribeToManifestChange((record?: ManifestRecord | null) => {
      setEffectiveSpreadsheetId(record?.spreadsheetId ?? null);
    });

    const handleStorage = (event: StorageEvent) => {
      if (event.key === manifestStorageKey()) {
        syncFromStorage();
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const hasSpreadsheet = Boolean(effectiveSpreadsheetId);

  return (
    <div className="flex flex-col gap-12">
      <section className="flex items-center justify-between rounded-xl border border-zinc-200/70 bg-white/60 px-4 py-3 text-sm shadow-sm shadow-zinc-900/5 backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/70">
        <div className="flex flex-col">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{displayName}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Signed in with Google</span>
        </div>
        <SignOutButton />
      </section>

      <ManagerNavigation />

      <ConnectSpreadsheetCard />

      <SpreadsheetHealthProvider>
        <div className="flex flex-col gap-12">
          <SpreadsheetHealthPanel />

          {hasSpreadsheet ? (
            <>
              <BaseCurrencySelector />
              {children}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200/80 bg-zinc-50/70 p-6 text-sm text-zinc-700 shadow-inner shadow-white/40 dark:border-zinc-700/60 dark:bg-zinc-950/50 dark:text-zinc-200">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Connect a spreadsheet to continue</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Choose or create a Google Sheet above to unlock manager views. Once connected, managers will load automatically.
              </p>
            </div>
          )}
        </div>
      </SpreadsheetHealthProvider>
    </div>
  );
}
