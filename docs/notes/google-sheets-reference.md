# Next.js + Google Sheets Personal Apps (No‑DB) — Research Context & Implementation Notes

# Goal & Boundaries
A compact research brief to help an autonomous coding agent implement **personal, single‑user web apps** that use **Google Sheets as the data store**, with **Next.js** for the UI + server. Emphasis on:

- Personal apps (1 user; at most a couple of devices concurrently)
- UX: “Sign in with Google → pick or create a spreadsheet → app runs”
- Minimize verification friction and risk (prefer **non‑sensitive scopes** when possible)
- Robust enough for light CRUD, lists, filters, charts; no heavy multi‑user concurrency
- **No server-side database whatsoever.** Transient/ephemeral state lives only in the session (e.g., Auth.js session/JWT). Any **persistent** state must be stored **client-side** (e.g., localStorage or IndexedDB) or **inside the selected Spreadsheet** (e.g., a `_meta` tab).
- **Do not use Google Drive App Data Folder** or any server-hosted database.

---

# Feasibility Snapshot
**Feasible** for single‑user tools. Performance is adequate for light workloads if you batch operations, append in chunks, and avoid per‑cell calls. Sheets impose **per‑minute quotas** (per project and per user), a recommended **2 MB max payload per request**, and **~180s processing timeouts**. A single spreadsheet can hold **~10M cells**. For personal apps, these limits are generous; design for batching & retry/backoff.

---

# High‑Level Architecture Options

## A) Server‑centric (recommended default)
- Next.js routes (API routes / Server Actions) handle **Sheets + Drive** calls via the **Google APIs Node.js client**.
- Auth handled by **Auth.js / NextAuth (Google provider)** using the **authorization code flow** (server-side), storing **access token + refresh token** (with rotation) in encrypted sessions/DB.
- Browser uses app’s API; never calls Google APIs directly (except **Google Picker** for Drive file selection).
- Pros: simpler token security, no client secrets in browser, easier to add background tasks, predictable CORS.
- Cons: slightly more plumbing for token storage/rotation.

## B) Hybrid with Google Picker (client) + server for API calls
- Browser uses **Google Picker** to let the user select/create a file. Picker runs in the browser and can obtain a short‑lived access token (GIS token model) or be used in conjunction with your server‑side tokens.
- After selection, your server stores the spreadsheetId and performs all CRUD.
- Pros: Best UX for selecting files; minimal Drive scope exposure.
- Cons: You still want server‑side Sheets/Drive operations for security and reliability.

> **Edge runtime note**: The official **googleapis** Node client expects Node APIs; keep Google API calls on **Node runtime** (not Edge) in Next.js.

---

# Identity & Authorization

## Sign‑in
- Use **Auth.js / NextAuth Google provider** with OIDC: request `openid email profile` for identity.
- If you need long‑lived access to Sheets/Drive from the server, request **offline access** so Google returns a **refresh token**. Google only sends a refresh token the **first** time a user consents; to force re‑issue, include `prompt=consent&access_type=offline` (this will reprompt users).
- **Testing mode** on the OAuth consent screen limits you to **100 test users**. Test user authorizations **expire in ~7 days** in Testing; move to **Production** to avoid that.

## Scopes (principle: least privilege)
- **Drive**: Prefer **`https://www.googleapis.com/auth/drive.file`** (non‑sensitive). App sees only files it **creates** or that the user **explicitly picks** (via Picker/chooser). This dramatically reduces verification friction.
- **Sheets**:
  - **Read‑only**: `https://www.googleapis.com/auth/spreadsheets.readonly`
  - **Read/Write**: `https://www.googleapis.com/auth/spreadsheets`
  - Sheets scopes are generally **sensitive** (verification may be required for a public app). For personal use with few users, Testing or unlisted distribution is typically fine.

## Google Picker specifics
- Picker runs in the **browser**. Use **Google Identity Services (GIS)** (modern replacement for `gapi.auth2`) for access tokens.
- Newer Picker method `DocsView.setFileIds(fileIds)` allows **pre‑selecting** files to streamline consent for specific files.
- Picker plus **`drive.file`** scope is the recommended way to get **per‑file consent** instead of full Drive access.

---

# Quotas & Limits (Sheets)
- **Per project**: ~**300 read/min**, **300 write/min** (refilled each minute).
- **Per user per project**: ~**60 read/min**, **60 write/min**.
- **Request payload**: keep under ~**2 MB** recommended for speed; requests over **~180s** time out.
- **Spreadsheet size**: up to **~10M cells**. Large sheets can become slow for recalcs and API ops.
- **Best practice**: batch reads (`values.batchGet`) and writes (`values.batchUpdate` / `spreadsheets.batchUpdate`), implement **truncated exponential backoff** on HTTP 429/5xx, and cache aggressively.

---

# Data Modeling in Sheets (treat a Sheet as a table)
- Use one **header row** (normalized, slug‑case field names).
- Include a stable **`id`** (UUID or short ULID), **`created_at`**, **`updated_at`**, and optional **`rev`** (monotonic integer) for optimistic concurrency.
- Prefer **flat, typed columns** (string/number/date/boolean). Avoid formulas for core data; use an **Analysis** tab for formulas/pivots.
- Use **named ranges** for “tables” (e.g., `expenses_table`) to decouple logic from A1 ranges.
- Consider **DeveloperMetadata** (spreadsheet/sheet‑level) to tag tables owned by your app.
- Keep “system data” (migrations, schema version) in either the **App Data Folder** (Drive) or a hidden **`_meta`** sheet.

---

# CRUD Patterns (Values API)
- **Read**: `spreadsheets.values.batchGet` with A1 or named ranges. Set `valueRenderOption` and `dateTimeRenderOption` appropriately.
- **Append rows**: `spreadsheets.values.append` with `valueInputOption=RAW` (or `USER_ENTERED` if you want Sheets to parse numbers/dates). Appends at end; good for logs/transactions.
- **Update cells**: `spreadsheets.values.batchUpdate` with multiple ranges in one call.
- **Structural ops** (add sheet, resize columns, formatting, data validation, named ranges): `spreadsheets.batchUpdate` (atomic; all‑or‑nothing).
- **Conflict handling** for single user usually fine with “last write wins.” For defense‑in‑depth, include a `rev` column and reject updates if `rev` mismatches.

---

# Concurrency & Sync
- Real‑time multi‑user editing is **not** the goal here. Still, guard against races:
  - Use **batch** endpoints to minimize round‑trips.
  - Optionally track a per‑row `rev` and only update if `rev` matches; on conflict, refetch and merge.
  - If you need cross‑device change awareness, use **Drive Changes API + push notifications** (requires a public HTTPS webhook; channels expire and must be renewed). For personal apps, simple **polling** (e.g., check `modifiedTime` or a heartbeat cell) is usually enough.

---

# Performance Tips
- **Batch** everything; avoid per‑cell calls.
- Prefer **append** for log‑like data; do bulk updates via `batchUpdate`.
- Avoid volatile formulas in the data table; isolate heavy formulas to a separate analysis sheet.
- Cache reads server‑side (short TTL) and debounce writes. Consider a small in‑memory queue to coalesce writes.
- Keep each request body under ~2 MB and avoid huge row counts in one call (split into chunks of a few thousand cells).

---

# Error Handling & Resilience
- Implement **exponential backoff + jitter** on 429/5xx.
- Respect **HTTP 412** / precondition errors if you adopt ETag‑based concurrency elsewhere.
- Surface friendly user errors for quota exhaustion/timeouts; suggest waiting a minute and retrying.
- Keep a **local export**/backup option (CSV of the core table) to recover from accidental data edits.
- Drive keeps **revisions** for Sheets, but programmatic revision content downloads for Sheets are limited; the UI (Version history) is the primary restoration path.

---

# Security & Privacy Considerations
- Use **least‑privilege scopes** (Drive `drive.file`, optional `drive.appdata`, then only the necessary Sheets scope).
- Keep **Google API calls on the server**; do not expose client secrets.
- If using **Picker**: restrict your **API key** to your domain/origins; prefer OAuth token‑backed access.
- Encrypt tokens at rest; implement **refresh token rotation** with Auth.js.
- If you later ship to more users, plan for **OAuth app verification** (branding, domain, demo video showing why you need the scopes).

---

# UX Flow (target experience)
1) User opens app → clicks **Sign in with Google**.
2) If first‑run:
   - Show **Google Picker** to **create** or **select** a Spreadsheet; store `spreadsheetId` **client-side** (IndexedDB/localStorage) and/or in a spreadsheet `_meta` sheet.
   - Optionally create initial sheets: `data`, `analysis`, `_meta`.
3) App UI provides CRUD over the chosen table(s); all Google API calls go through server routes.
4) User can **switch** the backing spreadsheet later (re‑open Picker) without re‑onboarding.

---

# Minimal Scope Sets (examples)
- **Read‑only viewer**: `openid email profile`, `spreadsheets.readonly`, `drive.file` (for user‑picked files).
- **Full CRUD single‑file app**: `openid email profile`, `spreadsheets`, `drive.file` (+ `drive.appdata` if storing manifest).
- **Picker‑only + server CRUD**: same as above; Picker uses GIS in browser for selection.

> For purely personal use where you don’t publish the app, keeping the OAuth consent screen in **Testing** and using **drive.file** can avoid lengthy verification. Move to **Production** to eliminate the 7‑day token expiry for test users.

---

# Data Layout Conventions (suggested)
- **Sheet name** = table name (`expenses`, `projects`, etc.)
- **Header row** fields: `id`, `created_at`, `updated_at`, `rev`, `...domain fields...`
- **Types**: ISO 8601 timestamps, explicit number formats, booleans as `TRUE/FALSE` (not strings).
- **Named ranges**: e.g., `expenses_table = expenses!A1:Z`
- **_meta** sheet: `schema_version`, `app_version`, `last_migration_at`, notes.

---

# Implementation Nuts & Bolts (for the agent)
- **Server**: use the **Google APIs Node.js client**; keep calls in API routes/Server Actions (Node runtime).
- **Auth**: Auth.js Google provider; request `access_type=offline` + `prompt=consent` on first sign‑in to ensure refresh token issuance; implement refresh token rotation.
- **Picker**: integrate **Google Identity Services** in the browser, then instantiate **Google Picker** for Drive file selection; use `DocsView.setFileIds` to pre‑navigate when you know IDs.
- **Storage of selection**: store a small JSON manifest **client-side** (IndexedDB/localStorage). Optionally mirror the manifest **inside the spreadsheet** in a hidden `_meta` sheet. Include `spreadsheetId`, `selectedTables`, `createdAt`.
- **Batching**: prefer `values.batchGet` / `values.batchUpdate` and `spreadsheets.batchUpdate` for structural ops.
- **Backoff**: standard truncated exponential backoff with jitter on 429/5xx.
- **Testing limits**: remember 7‑day expiry for test user authorizations in **Testing** mode.

---

# Known Pitfalls & Gotchas
- Not receiving a **refresh token**: happens if the user already granted consent — add `prompt=consent` or ask user to remove the app from **myaccount.google.com/permissions** and sign in again.
- Trying to use **googleapis** from the **Edge** runtime → failures; move calls server‑side Node runtime.
- Using **broad Drive scopes** (`drive`) triggers heavier verification and unnecessary access. Use **`drive.file`**.
- Over‑reliance on formulas in data tables → brittle API updates and recalcs; separate analysis from raw data.
- Huge single requests (>2 MB) or too many per‑minute calls → 429/timeouts. Batch and throttle.
- Relying on programmatic **revision restore** for Sheets content → very limited; use UI version history or keep your own snapshots (CSV export).

---

# “When NOT to use Sheets as a DB” heuristics
- You need high‑write throughput, complex relational queries, or multi‑user concurrent editing with conflict resolution.
- You need strong transactional semantics across multiple tables.
- You expect datasets beyond a few hundred thousand cells, or frequent updates per second.
  
In these cases, consider **SQLite** (embedded), **Neon/Supabase Postgres**, or **Firestore** and keep a Sheet as an export/reporting view.

---

# Glossary of Key Endpoints (by family)
**Sheets – Values API**
- `spreadsheets.values.get | batchGet | update | batchUpdate | append`

**Sheets – Batch (structural)**
- `spreadsheets.batchUpdate` (add/remove sheets, named ranges, formatting, validation, protected ranges)

**Drive (files)**
- `files.create` (MIME: `application/vnd.google-apps.spreadsheet`)
- `files.get` (fields: `id,name,mimeType,modifiedTime,owners`)
- `files.list` (scoped by `drive.file` + Picker‑selected items)
- `files.export` (CSV for backups) — not for native Sheets content *per revision*.

**Drive – Changes / Push (optional)**
- `changes.getStartPageToken`, `changes.list`, `files.watch`, `changes.watch` (channels expire; renew regularly).

**Picker (browser)**
- Load **GIS** + **Picker**; use `DocsView`, `setIncludeFolders`, `setOwnedByMe`, `setFileIds`, etc.

---

# Test Plan (acceptance criteria for a prototype)
- Sign‑in with Google works (Production publishing status; no 7‑day expiry in normal use).
- First‑run flow: Picker launches; user creates/picks a Sheet → app persists `spreadsheetId` (App Data Folder manifest) and can read headers + n rows.
- CRUD:
  - Append 10 rows in one `values.append` call.
  - Batch update 5 disjoint ranges in one `values.batchUpdate`.
  - Add a new sheet/tab via `spreadsheets.batchUpdate` and register a named range.
- Quota safety: throttle to < 60 writes/min/user; retry on 429 with backoff.
- Security: scopes limited to `drive.file` + `spreadsheets` (and `drive.appdata` if used). API key restricted. Tokens encrypted at rest.
- Backups: export current table to CSV on demand.

---

# Future Extensions
- **Template installer**: pre‑seed new spreadsheets with tabs, headers, named ranges, formatting.
- **Schema migrations**: `_meta.schema_version` + in‑app migrator.
- **Offline edits**: local queue → replay when online.
- **Charts**: either client‑side (e.g., using values API) or native Sheets charts embedded and read‑only in app.
- **Multi‑file**: manifest maps logical tables → multiple spreadsheets for scale.

---

# Quick Reference (strings & IDs)
- Sheets scopes: `https://www.googleapis.com/auth/spreadsheets`, `.../spreadsheets.readonly`
- Drive scopes: `https://www.googleapis.com/auth/drive.file` (recommended), 
- OIDC scopes: `openid email profile`
- Create Sheet MIME: `application/vnd.google-apps.spreadsheet`
- Picker classes: `google.picker.PickerBuilder`, `google.picker.DocsView`, `DocsView.setFileIds([...])`

---

*This brief is intentionally descriptive (not prescriptive) so an agent can choose the appropriate flow based on environment and constraints while staying within safe scope/verification boundaries for personal apps.*

