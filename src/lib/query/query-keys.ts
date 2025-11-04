export const queryKeys = {
  sheet: (sheetId: string) => ["sheet", sheetId] as const,
  categories: (sheetId: string) => ["sheet", sheetId, "categories"] as const,
  budgetPlan: (sheetId: string) => ["sheet", sheetId, "budget-plan"] as const,
  // add more slices as rollout continues
};
