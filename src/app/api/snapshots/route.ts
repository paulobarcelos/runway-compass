// ABOUTME: Connects snapshots API verbs to shared handler factory.
// ABOUTME: Keeps Next.js route exports limited to GET/POST.
import { createSnapshotsHandler } from "./snapshots-handler";

const handlers = createSnapshotsHandler();

export const GET = handlers.GET;
export const POST = handlers.POST;
