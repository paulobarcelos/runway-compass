// ABOUTME: Routes HTTP verbs for the accounts API to the shared handler.
// ABOUTME: Keeps the file export surface compatible with Next.js routing.
import { createAccountsHandler } from "./accounts-handler";

const handlers = createAccountsHandler();

export const GET = handlers.GET;
export const POST = handlers.POST;
