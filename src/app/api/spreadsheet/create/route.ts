// ABOUTME: Exports the spreadsheet creation handler via shared factory.
// ABOUTME: Keeps Next.js route module limited to POST verb export.
import { createCreateHandler } from "./create-handler";

export const POST = createCreateHandler();
