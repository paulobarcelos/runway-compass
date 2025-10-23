// ABOUTME: Provides controllable runway client responses for hook tests.
// ABOUTME: Captures calls and simulates success or error payloads.
let nextResponse = [];
let nextError: Error | null = null;
const calls: string[] = [];

export class RunwayClientError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RunwayClientError";
    this.status = status;
  }
}

export function __setRunwayClientResponse(records: unknown[]) {
  nextResponse = records;
  nextError = null;
}

export function __setRunwayClientError(error: Error) {
  nextError = error;
}

export function __resetRunwayClientStub() {
  nextResponse = [];
  nextError = null;
  calls.length = 0;
}

export function __getRunwayClientCalls() {
  return calls.slice();
}

export async function fetchRunwayProjection(spreadsheetId: string) {
  calls.push(spreadsheetId);

  if (nextError) {
    throw nextError;
  }

  return nextResponse;
}
