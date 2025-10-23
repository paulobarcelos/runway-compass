// ABOUTME: Replaces debug logging with a no-op for deterministic tests.
// ABOUTME: Prevents tests from triggering console output or network calls.

export async function debugLog() {
  // Intentionally empty.
}
