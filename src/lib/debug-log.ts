// ABOUTME: Emits optional client debug logs with stack context.
function isDebugEnabled() {
  return process.env.NEXT_PUBLIC_DEBUG_LOGS === "true";
}

export function debugLog(message: string, data?: unknown) {
  if (!isDebugEnabled()) {
    return;
  }

  const emitDebug = console.info.bind(console);
  emitDebug("[debug]", message, data);
}
