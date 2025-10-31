# Debug Log Cleanup Design (2025-10-31)

## Goal
Remove the remote debug logging relay while keeping lightweight client console logging behind `NEXT_PUBLIC_DEBUG_LOGS`.

## Context
- Prior to this cleanup, `/api/dev-log` relayed client logs to the server when `DEBUG_LOGS` was true.
- The client helper `src/lib/debug-log.ts` posted logs to that route and relied on async fetch calls.
- Tests in `tests/dev-log-route.test.cjs` covered the relay behavior.

## Decisions
- Delete the API route and any server-only flag usage (`DEBUG_LOGS`).
- Simplify `debugLog` helper to synchronously emit to `console.info` when `NEXT_PUBLIC_DEBUG_LOGS` parses to true; no fetch requests.
- Keep helper signature compatible for existing call sites; treat message + optional data.
- Remove route tests; add unit tests covering helper behavior (flag disabled/enabled, no network).
- Update documentation to state debug logging is console-only.

## Verification Plan
1. Replace route tests with new `debug-log` helper tests using `node:test`.
2. Ensure repo has no references to `/api/dev-log` or `DEBUG_LOGS` after removal.
3. Run `npm run lint` and `npm test`.
4. Update docs/readme references accordingly.
