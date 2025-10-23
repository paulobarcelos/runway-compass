// ABOUTME: Exports bootstrap POST handler using shared factory.
// ABOUTME: Keeps Next.js route module limited to verb export only.
import { createBootstrapHandler } from "./bootstrap-handler";

export const POST = createBootstrapHandler();
