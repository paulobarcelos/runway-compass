// ABOUTME: Accepts client debug logs and prints them server-side when enabled.
// ABOUTME: Ignored unless DEBUG_LOGS flag is set to true.
import { NextResponse } from "next/server";

interface DevLogBody {
  message?: string;
  data?: unknown;
  location?: string;
  timestamp?: number;
}

export async function POST(request: Request) {
  const debugEnabled = process.env.DEBUG_LOGS === "true";

  if (!debugEnabled) {
    return NextResponse.json({ accepted: false }, { status: 200 });
  }

  let body: DevLogBody = {};

  try {
    body = ((await request.json()) as DevLogBody) ?? {};
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const location = body.location ?? "unknown";
  const message = body.message ?? "(no message)";
  const stamp = body.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString();

  console.info(`[client-debug] ${stamp} ${location}: ${message}`, body.data);

  return NextResponse.json({ accepted: true }, { status: 200 });
}
