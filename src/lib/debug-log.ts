// ABOUTME: Emits optional client debug logs with stack context.
// ABOUTME: Sends logs to server when debug mode is enabled.
const DEBUG_FLAG = process.env.NEXT_PUBLIC_DEBUG_LOGS === "true";

function extractLocation(stack?: string | null) {
  if (!stack) {
    return "unknown";
  }

  const lines = stack.split("\n");
  for (const line of lines) {
    if (line.includes("debugLog")) {
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith("at ")) {
      return trimmed.replace(/^at\s+/, "");
    }
  }

  return "unknown";
}

type DebugPayload = {
  message: string;
  data?: unknown;
  location: string;
  timestamp: number;
};

async function sendToServer(payload: DebugPayload) {
  try {
    await fetch("/api/dev-log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (error) {
    // Swallow logging errors silently.
  }
}

export async function debugLog(message: string, data?: unknown) {
  if (!DEBUG_FLAG) {
    return;
  }

  const error = new Error();
  const location = extractLocation(error.stack);
  const payload: DebugPayload = {
    message,
    data,
    location,
    timestamp: Date.now(),
  };

  if (typeof window !== "undefined") {
    console.info(`[debug] ${location}: ${message}`, data);
    await sendToServer(payload);
  } else {
    console.info(`[debug] ${location}: ${message}`, data);
  }
}
