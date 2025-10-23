// ABOUTME: Bridges HTTP verbs to the reusable categories handler factory.
// ABOUTME: Keeps Next.js route exports limited to verbs only.
import { createCategoriesHandler } from "./categories-handler";

const handlers = createCategoriesHandler();

export const GET = handlers.GET;
export const POST = handlers.POST;
