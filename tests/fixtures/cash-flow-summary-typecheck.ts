// ABOUTME: Type-only fixture asserting monthly summaries expose numeric totals.
// ABOUTME: Imports summarize helper and mutates totals to enforce number typing.
import { summarizeCashFlowsByMonth } from "../../src/server/google/repository/cash-flow-repository";

const summary = summarizeCashFlowsByMonth([]);

for (const [, bucket] of summary) {
  bucket.plannedIncome += 1;
  bucket.plannedExpense += 1;
  bucket.postedIncome += 1;
  bucket.postedExpense += 1;
}
