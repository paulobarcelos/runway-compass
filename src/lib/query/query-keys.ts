type SheetQueryKey<TSuffix extends string | undefined = undefined> = TSuffix extends string
  ? readonly ["sheet", string, TSuffix]
  : readonly ["sheet", string];

export const queryKeys = {
  sheet: (sheetId: string): SheetQueryKey => ["sheet", sheetId] as const,
  categories: (sheetId: string): SheetQueryKey<"categories"> =>
    ["sheet", sheetId, "categories"] as const,
  budgetPlan: (sheetId: string): SheetQueryKey<"budget-plan"> =>
    ["sheet", sheetId, "budget-plan"] as const,
};
