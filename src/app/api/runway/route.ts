// ABOUTME: Connects runway route exports to the shared handler factory.
// ABOUTME: Keeps routing limited to HTTP verbs for Next.js compliance.
import { createRunwayHandler } from "./runway-handler";

const handlers = createRunwayHandler();

export const GET = handlers.GET;

export type { FetchRunwayProjectionOptions } from "./runway-handler";
