// ABOUTME: Registers the runway projection refresh POST route.
// ABOUTME: Delegates work to the shared refresh handler factory.
import { createRunwayRefreshHandler } from "./runway-refresh-handler";

const handlers = createRunwayRefreshHandler();

export const POST = handlers.POST;
