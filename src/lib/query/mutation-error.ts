export function formatMutationError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Sync failed. Please retry.";
}
