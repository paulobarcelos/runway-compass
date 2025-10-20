// ABOUTME: Renders Google Sheets picker controls for spreadsheet selection.
// ABOUTME: Persists manifest locally and registers selection via API route.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  clearManifest,
  loadManifest,
  saveManifest,
  type ManifestRecord,
} from "@/lib/manifest-store";

const PICKER_SCOPES =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";
const GSI_SCRIPT = "https://accounts.google.com/gsi/client";
const GAPI_SCRIPT = "https://apis.google.com/js/api.js";

declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

type AsyncStatus = "idle" | "authorizing" | "registering" | "creating";

const scriptPromises = new Map<string, Promise<void>>();

function loadScriptOnce(src: string) {
  if (scriptPromises.has(src)) {
    return scriptPromises.get(src)!;
  }

  const promise = new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Script loading unavailable in this environment"));
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);

    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    if (existing && typeof existing.readyState === "string") {
      const state = existing.readyState;
      if (state === "complete" || state === "loaded") {
        existing.dataset.loaded = "true";
        resolve();
        return;
      }
    }

    const script = existing ?? document.createElement("script");

    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });

    script.addEventListener("error", () => {
      reject(new Error(`Failed to load script: ${src}`));
    });

    if (!existing) {
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  scriptPromises.set(src, promise);

  return promise;
}

async function ensurePickerLoaded() {
  await loadScriptOnce(GSI_SCRIPT);
  await loadScriptOnce(GAPI_SCRIPT);

  if (!window.gapi) {
    throw new Error("Google API client unavailable");
  }

  await new Promise<void>((resolve, reject) => {
    window.gapi.load("picker", {
      callback: () => resolve(),
      onerror: () => reject(new Error("Failed to initialize Google Picker")),
      timeout: 5000,
      ontimeout: () => reject(new Error("Timed out loading Google Picker")),
    });
  });

  if (!window.google?.accounts?.oauth2) {
    throw new Error("Google Identity Services unavailable");
  }

  if (!window.google?.picker) {
    throw new Error("Google Picker SDK unavailable");
  }
}

async function requestOAuthToken(clientId: string) {
  await ensurePickerLoaded();

  return new Promise<string>((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: PICKER_SCOPES,
      callback: (response: { access_token?: string; error?: string }) => {
        if (response?.access_token) {
          resolve(response.access_token);
        } else {
          reject(new Error(response?.error ?? "Missing access token"));
        }
      },
      error_callback: (error: { error: string }) => {
        reject(new Error(error?.error ?? "Token request failed"));
      },
    });

    tokenClient.requestAccessToken({ prompt: "" });
  });
}

async function showPicker({
  developerKey,
  clientId,
  appId,
}: {
  developerKey: string;
  clientId: string;
  appId?: string;
}) {
  await ensurePickerLoaded();

  const oauthToken = await requestOAuthToken(clientId);

  return await new Promise<string | null>((resolve) => {
    const picker = new window.google.picker.PickerBuilder()
      .setDeveloperKey(developerKey)
      .setOAuthToken(oauthToken)
      .addView(
        new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS)
          .setSelectFolderEnabled(false)
          .setIncludeFolders(false)
          .setOwnedByMe(true),
      )
      .enableFeature(window.google.picker.Feature.SUPPORT_DRIVES)
      .enableFeature(window.google.picker.Feature.CREATE_NEW_DRIVE_ENTRY)
      .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
      .setCallback((data: any) => {
        const action = data?.[window.google.picker.Response.ACTION];

        if (action === window.google.picker.Action.PICKED) {
          const documents = data?.[window.google.picker.Response.DOCUMENTS] ?? [];
          const document = documents[0];
          const spreadsheetId = document?.[window.google.picker.Document.ID];

          resolve(typeof spreadsheetId === "string" ? spreadsheetId : null);
        } else if (action === window.google.picker.Action.CANCEL) {
          resolve(null);
        }
      });

    if (appId) {
      picker.setAppId(appId);
    }

    picker.build().setVisible(true);
  });
}

export function ConnectSpreadsheetCard() {
  const [manifest, setManifest] = useState<ManifestRecord | null>(null);
  const [status, setStatus] = useState<AsyncStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const developerKey = useMemo(
    () => process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? "",
    [],
  );
  const clientId = useMemo(
    () => process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
    [],
  );
  const projectNumber = useMemo(
    () => process.env.NEXT_PUBLIC_GOOGLE_PICKER_PROJECT_NUMBER ?? "",
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = loadManifest(window.localStorage);
    setManifest(stored);
  }, []);

  const persistManifest = useCallback((record: ManifestRecord) => {
    if (typeof window === "undefined") {
      return;
    }

    saveManifest(window.localStorage, record);
    setManifest(record);
  }, []);

  const registerSpreadsheet = useCallback(async (spreadsheetId: string) => {
    const response = await fetch("/api/spreadsheet/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ spreadsheetId }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = typeof payload.error === "string" ? payload.error : "Failed to register spreadsheet";
      throw new Error(message);
    }

    if (!payload?.manifest) {
      throw new Error("Missing manifest response");
    }

    return payload.manifest as ManifestRecord;
  }, []);

  const handleSelect = useCallback(async () => {
    if (status !== "idle" || syncing) {
      return;
    }

    setError(null);

    if (!developerKey || !clientId) {
      setError("Google Picker environment variables are not configured");
      return;
    }

    setStatus("authorizing");

    try {
      const spreadsheetId = await showPicker({
        developerKey,
        clientId,
        appId: projectNumber || undefined,
      });

      if (!spreadsheetId) {
        return;
      }

      setStatus("registering");
      const manifest = await registerSpreadsheet(spreadsheetId);
      persistManifest(manifest);
    } catch (pickerError) {
      const message =
        pickerError instanceof Error ? pickerError.message : "Failed to open Google Picker";
      setError(message);
    } finally {
      setStatus("idle");
    }
  }, [status, syncing, developerKey, clientId, projectNumber, registerSpreadsheet, persistManifest]);

  const handleCreate = useCallback(async () => {
    if (status !== "idle" || syncing) {
      return;
    }

    setError(null);
    setStatus("creating");

    try {
      const response = await fetch("/api/spreadsheet/create", {
        method: "POST",
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = typeof payload.error === "string" ? payload.error : "Failed to create spreadsheet";
        throw new Error(message);
      }

      if (!payload?.manifest) {
        throw new Error("Missing manifest response");
      }

      persistManifest(payload.manifest as ManifestRecord);
    } catch (creationError) {
      const message =
        creationError instanceof Error ? creationError.message : "Unable to create spreadsheet";
      setError(message);
    } finally {
      setStatus("idle");
    }
  }, [status, syncing, persistManifest]);

  useEffect(() => {
    if (!manifest?.spreadsheetId) {
      return;
    }

    let cancelled = false;

    const sync = async () => {
      setSyncing(true);

      try {
        const response = await fetch("/api/spreadsheet/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spreadsheetId: manifest.spreadsheetId }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          if (!cancelled) {
            const message =
              typeof payload.error === "string"
                ? payload.error
                : "Failed to bootstrap spreadsheet";
            setError(message);
          }
          return;
        }

        if (!payload?.manifest) {
          if (!cancelled) {
            setError("Missing bootstrap response");
          }
          return;
        }

        const result = payload.manifest as {
          spreadsheetId: string;
          storedAt?: number;
        };

        if (
          !cancelled &&
          result.spreadsheetId === manifest.spreadsheetId &&
          typeof result.storedAt === "number" &&
          result.storedAt !== manifest.storedAt
        ) {
          persistManifest({
            spreadsheetId: result.spreadsheetId,
            storedAt: result.storedAt,
          });
        }
      } catch (bootstrapError) {
        if (!cancelled) {
          const message =
            bootstrapError instanceof Error
              ? bootstrapError.message
              : "Unable to bootstrap spreadsheet";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setSyncing(false);
        }
      }
    };

    void sync();

    return () => {
      cancelled = true;
    };
  }, [manifest?.spreadsheetId, persistManifest]);

  const handleDisconnect = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    clearManifest(window.localStorage);
    setManifest(null);
    setError(null);
  }, []);

  const disableActions = status !== "idle" || syncing;
  const selectLabel =
    syncing
      ? "Syncing..."
      : status === "authorizing"
        ? "Authorizing..."
        : status === "registering"
          ? "Connecting..."
          : manifest
            ? "Change spreadsheet"
            : "Select spreadsheet";
  const createLabel = syncing
    ? "Syncing..."
    : status === "creating"
      ? "Creating..."
      : "Create new spreadsheet";

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200/70 bg-white/60 p-6 shadow-sm shadow-zinc-900/5 backdrop-blur dark:border-zinc-700/60 dark:bg-zinc-900/70">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Spreadsheet connection</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Select or create the Google Sheet Runway Compass will use for runway data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSelect}
            disabled={disableActions}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-emerald-400"
          >
            {selectLabel}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={disableActions}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-500 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-emerald-300 disabled:text-emerald-300 dark:border-emerald-400 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
          >
            {createLabel}
          </button>
        </div>
      </div>

      {manifest ? (
        <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/70 p-4 text-sm text-emerald-900 dark:border-emerald-700/70 dark:bg-emerald-900/30 dark:text-emerald-100">
          <p className="font-medium">Connected spreadsheet</p>
          <p className="mt-1 break-all text-xs">
            <a
              className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
              href={`https://docs.google.com/spreadsheets/d/${manifest.spreadsheetId}/edit`}
              target="_blank"
              rel="noreferrer"
            >
              {manifest.spreadsheetId}
            </a>
          </p>
          <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-200/80">
            Stored {new Date(manifest.storedAt).toLocaleString()}
          </p>
          <button
            type="button"
            onClick={handleDisconnect}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-800 underline decoration-dotted underline-offset-2 hover:decoration-solid dark:text-emerald-200"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No spreadsheet connected. Create a dedicated sheet or pick an existing one you trust with
          runway data.
        </p>
      )}

      {error ? (
        <div className="rounded-lg border border-rose-200/70 bg-rose-50/80 p-3 text-sm text-rose-700 dark:border-rose-800/60 dark:bg-rose-900/30 dark:text-rose-200">
          {error}
        </div>
      ) : null}
    </section>
  );
}
