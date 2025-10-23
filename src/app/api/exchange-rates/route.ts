// ABOUTME: Provides exchange rate GET handler without extra exports.
// ABOUTME: Ensures Next.js route only exposes the verb implementation.
import { createExchangeRatesHandler } from "./exchange-rates-handler";

export const GET = createExchangeRatesHandler();
