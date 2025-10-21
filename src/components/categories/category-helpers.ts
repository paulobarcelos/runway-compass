// ABOUTME: Provides helpers for working with category drafts in the UI.
// ABOUTME: Generates identifiers and compares category collections.

export interface CategoryDraft {
  categoryId: string;
  label: string;
  color: string;
  rolloverFlag: boolean;
  sortOrder: number;
  monthlyBudget: string;
  currencyCode: string;
}

export function createBlankCategory(sortOrder: number): CategoryDraft {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `cat-${Math.random().toString(36).slice(2)}`;

  return {
    categoryId: id,
    label: "",
    color: "#999999",
    rolloverFlag: false,
    sortOrder,
    monthlyBudget: "",
    currencyCode: "",
  };
}

export function categoriesEqual(a: CategoryDraft[], b: CategoryDraft[]) {
  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];

    if (
      left.categoryId !== right.categoryId ||
      left.label !== right.label ||
      left.color !== right.color ||
      left.rolloverFlag !== right.rolloverFlag ||
      left.sortOrder !== right.sortOrder ||
      left.monthlyBudget !== right.monthlyBudget ||
      left.currencyCode !== right.currencyCode
    ) {
      return false;
    }
  }

  return true;
}
