// ABOUTME: Provides exponential backoff for Google API requests with jitter.
// ABOUTME: Retries transient failures like rate limits and server errors.
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface RetryDependencies {
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep: (ms: number) => Promise<void> = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const defaultRandom = Math.random;

function extractStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const errorWithCode = error as Record<string, unknown>;

  const code = errorWithCode.code ?? errorWithCode.status;

  if (typeof code === "number") {
    return code;
  }

  if (typeof code === "string") {
    const parsed = Number.parseInt(code, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  const response = errorWithCode.response;

  if (response && typeof response === "object" && "status" in response) {
    const status = (response as Record<string, unknown>).status;
    if (typeof status === "number") {
      return status;
    }
  }

  return null;
}

function shouldRetry(error: unknown) {
  const status = extractStatusCode(error);

  if (status == null) {
    return false;
  }

  return RETRYABLE_STATUS_CODES.has(status);
}

function computeDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number,
) {
  const exponential = Math.min(
    maxDelayMs,
    baseDelayMs * 2 ** attempt,
  );

  const jitterFactor = 0.5 + random() * 0.5;

  return exponential * jitterFactor;
}

export async function executeWithRetry<T>(
  run: () => Promise<T>,
  {
    maxAttempts = 5,
    baseDelayMs = 200,
    maxDelayMs = 5000,
  }: RetryOptions = {},
  dependencies: RetryDependencies = {},
): Promise<T> {
  const sleep = dependencies.sleep ?? defaultSleep;
  const random = dependencies.random ?? defaultRandom;

  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      return await run();
    } catch (error) {
      attempt += 1;

      if (!shouldRetry(error) || attempt >= maxAttempts) {
        throw error;
      }

      const delay = computeDelay(attempt - 1, baseDelayMs, maxDelayMs, random);

      await sleep(delay);
    }
  }

  throw new Error("Retry attempts exhausted");
}
