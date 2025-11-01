// ABOUTME: Provides helpers for working with category drafts in the UI.
// ABOUTME: Generates identifiers and compares category collections.

export interface CategoryDraft {
  categoryId: string;
  label: string;
  color: string;
  description: string;
  sortOrder: number;
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
    description: "",
    sortOrder,
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
      left.description !== right.description ||
      left.sortOrder !== right.sortOrder
    ) {
      return false;
    }
  }

  return true;
}
