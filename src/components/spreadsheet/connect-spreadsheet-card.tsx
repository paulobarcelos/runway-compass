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
import { emitManifestChange } from "@/lib/manifest-events";
import { debugLog } from "@/lib/debug-log";

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
}

interface GoogleTokenError {
  error: string;
}

interface GoogleTokenClient {
  requestAccessToken: (options: { prompt: string }) => void;
}

interface GoogleOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback: (error: GoogleTokenError) => void;
  }): GoogleTokenClient;
}

interface GoogleDocsView {
  setSelectFolderEnabled(value: boolean): GoogleDocsView;
  setIncludeFolders(value: boolean): GoogleDocsView;
  setOwnedByMe(value: boolean): GoogleDocsView;
}

interface GooglePickerCallbackData {
  [key: string]: unknown;
}

interface GooglePickerBuilder {
  setDeveloperKey(key: string): GooglePickerBuilder;
  setOAuthToken(token: string): GooglePickerBuilder;
  addView(view: GoogleDocsView): GooglePickerBuilder;
  enableFeature(feature: string): GooglePickerBuilder;
  setCallback(callback: (data: GooglePickerCallbackData) => void): GooglePickerBuilder;
  setAppId(appId: string): GooglePickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

interface GooglePickerNamespace {
  PickerBuilder: new () => GooglePickerBuilder;
  DocsView: new (viewId: string) => GoogleDocsView;
  ViewId: Record<string, string>;
  Response: Record<string, string>;
  Action: Record<string, string>;
  Feature: Record<string, string>;
  Document: Record<string, string>;
}

interface GoogleNamespace {
  accounts?: {
    oauth2?: GoogleOauth2;
  };
  picker?: GooglePickerNamespace;
}

interface GapiLoadOptions {
  callback: () => void;
  onerror: () => void;
  timeout?: number;
  ontimeout: () => void;
}

interface GapiNamespace {
  load(name: string, options: GapiLoadOptions): void;
}

const PICKER_SCOPES =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";
const GSI_SCRIPT = "https://accounts.google.com/gsi/client";
const GAPI_SCRIPT = "https://apis.google.com/js/api.js";

declare global {
  interface Window {
    google?: GoogleNamespace;
    gapi?: GapiNamespace;
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

    if (existing) {
      const scriptWithState = existing as HTMLScriptElement & { readyState?: string };
      const state = scriptWithState.readyState;
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

  return promise.catch((error) => {
    scriptPromises.delete(src);
    throw error;
  });
}

async function ensurePickerLoaded() {
  await loadScriptOnce(GSI_SCRIPT);
  await loadScriptOnce(GAPI_SCRIPT);

  if (!window.gapi) {
    throw new Error("Google API client unavailable");
  }

  await new Promise<void>((resolve, reject) => {
    window.gapi!.load("picker", {
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
    const oauth2 = window.google!.accounts!.oauth2!;
    const tokenClient = oauth2.initTokenClient({
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

  const pickerNamespace = window.google!.picker!;

  return await new Promise<string | null>((resolve) => {
    const pickerBuilder = new pickerNamespace.PickerBuilder()
      .setDeveloperKey(developerKey)
      .setOAuthToken(oauthToken)
      .addView(
        new pickerNamespace.DocsView(pickerNamespace.ViewId.SPREADSHEETS)
          .setSelectFolderEnabled(false)
          .setIncludeFolders(false)
          .setOwnedByMe(true),
      )
      .enableFeature(pickerNamespace.Feature.SUPPORT_DRIVES)
      .enableFeature(pickerNamespace.Feature.CREATE_NEW_DRIVE_ENTRY)
      .enableFeature(pickerNamespace.Feature.NAV_HIDDEN)
      .setCallback((data: GooglePickerCallbackData) => {
        const responseKeys = pickerNamespace.Response;
        const actionKeys = pickerNamespace.Action;

        const action = data?.[responseKeys.ACTION] as string | undefined;

        if (action === actionKeys.PICKED) {
          const documents = (data?.[responseKeys.DOCUMENTS] as GooglePickerCallbackData[]) ?? [];
          const document = documents[0];
          const spreadsheetId = document?.[pickerNamespace.Document.ID] as string | undefined;

          resolve(typeof spreadsheetId === "string" ? spreadsheetId : null);
        } else if (action === actionKeys.CANCEL) {
          resolve(null);
        }
      });

    if (appId) {
      pickerBuilder.setAppId(appId);
    }

    pickerBuilder.build().setVisible(true);
  });
}

export function ConnectSpreadsheetCard() {
  const [manifest, setManifest] = useState<ManifestRecord | null>(null);
  const [status, setStatus] = useState<AsyncStatus>("idle");
  const [error, setError] = useState<string | null>(null);

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
    void debugLog("Loaded manifest from storage", stored);
  }, []);

  const persistManifest = useCallback((record: ManifestRecord) => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = saveManifest(window.localStorage, record);
    setManifest(stored);
    emitManifestChange(stored);
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
    if (status !== "idle") {
      return;
    }

    setError(null);

    if (!developerKey || !clientId) {
      setError("Google Picker environment variables are not configured");
      return;
    }

    setStatus("authorizing");
    void debugLog("Launching picker", { projectNumber });

    try {
      const spreadsheetId = await showPicker({
        developerKey,
        clientId,
        appId: projectNumber || undefined,
      });

      if (!spreadsheetId) {
        void debugLog("Picker cancelled");
        return;
      }

      setStatus("registering");
       void debugLog("Registering spreadsheet", { spreadsheetId });
      const manifest = await registerSpreadsheet(spreadsheetId);
      persistManifest(manifest);
      void debugLog("Spreadsheet registered", manifest);
    } catch (pickerError) {
      const message =
        pickerError instanceof Error ? pickerError.message : "Failed to open Google Picker";
      setError(message);
      void debugLog("Picker error", { message });
    } finally {
      setStatus("idle");
    }
  }, [status, developerKey, clientId, projectNumber, registerSpreadsheet, persistManifest]);

  const handleCreate = useCallback(async () => {
    if (status !== "idle") {
      return;
    }

    setError(null);
    setStatus("creating");
    void debugLog("Creating spreadsheet");

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
      void debugLog("Spreadsheet created", payload.manifest);
    } catch (creationError) {
      const message =
        creationError instanceof Error ? creationError.message : "Unable to create spreadsheet";
      setError(message);
      void debugLog("Create spreadsheet error", { message });
    } finally {
      setStatus("idle");
    }
  }, [status, persistManifest]);

  const handleDisconnect = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    clearManifest(window.localStorage);
    setManifest(null);
    setError(null);
    emitManifestChange(null);
  }, []);

  const disableActions = status !== "idle";
  const selectLabel =
    status === "authorizing"
      ? "Authorizing..."
      : status === "registering"
        ? "Connecting..."
        : manifest
          ? "Change spreadsheet"
          : "Select spreadsheet";
  const createLabel =
    status === "creating"
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
            className="inline-flex items-center gap-2 rounded-full accent-bg px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:accent-bg-hover focus:outline-none focus:ring-2 focus:accent-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[color:color-mix(in_srgb,var(--color-accent)_65%,#ffffff_35%)]"
          >
            {selectLabel}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={disableActions}
            className="inline-flex items-center gap-2 rounded-full border accent-border px-4 py-2 text-sm font-medium accent-text transition hover:bg-[color:var(--color-accent-muted)] focus:outline-none focus:ring-2 focus:accent-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-[color:color-mix(in_srgb,var(--color-accent)_40%,transparent_60%)] disabled:text-[color:color-mix(in_srgb,var(--color-accent)_40%,#ffffff_60%)] dark:border-[color:color-mix(in_srgb,var(--color-accent)_50%,#ffffff_50%)] dark:text-[color:color-mix(in_srgb,var(--color-accent)_70%,#ede9fe_30%)] dark:hover:bg-[color:color-mix(in_srgb,var(--color-accent)_25%,#0a0a0a_75%)]"
          >
            {createLabel}
          </button>
        </div>
      </div>

      {manifest ? (
        <div className="rounded-lg border accent-border bg-[color:var(--color-accent-muted)] p-4 text-sm text-[color:var(--color-accent-muted-foreground)] dark:bg-[color:color-mix(in_srgb,var(--color-accent)_24%,#0a0a0a_76%)] dark:text-[color:color-mix(in_srgb,var(--color-accent)_75%,#ede9fe_25%)]">
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
          <p className="mt-1 text-xs text-[color:color-mix(in_srgb,var(--color-accent)_65%,#312e81_35%)] dark:text-[color:color-mix(in_srgb,var(--color-accent)_70%,#c7d2fe_30%)]">
            Stored {new Date(manifest.storedAt).toLocaleString()}
          </p>
          <button
            type="button"
            onClick={handleDisconnect}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium accent-text underline decoration-dotted underline-offset-2 hover:decoration-solid dark:text-[color:color-mix(in_srgb,var(--color-accent)_70%,#ede9fe_30%)]"
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
