// ABOUTME: Exports the spreadsheet repair POST handler via shared factory.
// ABOUTME: Keeps the route surface limited to the HTTP verb export.
import { createRepairHandler } from "./repair-handler";

export const POST = createRepairHandler();
