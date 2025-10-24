// ABOUTME: Provides controllable runway client responses for hook tests.
// ABOUTME: Captures calls and simulates success or error payloads.
import type { RunwayProjectionRecord } from "@/server/google/repository/runway-projection-repository";

let nextResponse: RunwayProjectionRecord[] = [];
let nextError: RunwayClientError | null = null;
const calls: string[] = [];

export class RunwayClientError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RunwayClientError";
    this.status = status;
  }
}

export function __setRunwayClientResponse(records: RunwayProjectionRecord[]) {
  nextResponse = records;
  nextError = null;
}

export function __setRunwayClientError(error: RunwayClientError) {
  nextError = error;
}

export function __resetRunwayClientStub() {
  nextResponse = [];
  nextError = null;
  calls.length = 0;
}

export function __getRunwayClientCalls(): string[] {
  return calls.slice();
}

export async function fetchRunwayProjection(
  spreadsheetId: string,
): Promise<RunwayProjectionRecord[]> {
  calls.push(spreadsheetId);

  if (nextError) {
    throw nextError;
  }

  return nextResponse;
}
