// ABOUTME: Exports spreadsheet register POST handler via shared factory.
// ABOUTME: Limits route exports to supported HTTP verbs.
import { createRegisterHandler } from "./register-handler";

export const POST = createRegisterHandler();

export type { RegisterBody } from "./register-handler";
