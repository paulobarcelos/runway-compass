// ABOUTME: Connects spreadsheet health API to shared handler factory.
// ABOUTME: Keeps Next.js route exports restricted to GET only.
import { createSpreadsheetHealthHandler } from "./health-handler";

export const GET = createSpreadsheetHealthHandler().GET;
