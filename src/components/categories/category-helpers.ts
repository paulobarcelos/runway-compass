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

export function resequenceDrafts(list: CategoryDraft[]): CategoryDraft[] {
  return list.map((item, index) => ({ ...item, sortOrder: index + 1 }));
}

export function normalizeDraftsFromResponse(source: Array<Record<string, unknown>>): CategoryDraft[] {
  const normalized = source
    .map((item) => ({
      categoryId: String(item.categoryId ?? "").trim(),
      label: String(item.label ?? "").trim(),
      color: String(item.color ?? "").trim(),
      description: String(item.description ?? "").trim(),
      sortOrder:
        typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)
          ? item.sortOrder
          : 0,
    }))
    .filter((item) => item.categoryId && item.label);

  normalized.sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.label.localeCompare(right.label);
  });

  return normalized.map((item, index) => ({
    ...item,
    sortOrder: index + 1,
  }));
}

export function buildSerializableCategories(drafts: CategoryDraft[]): CategoryDraft[] {
  return drafts.map((draft, index) => ({
    categoryId: draft.categoryId,
    label: draft.label.trim(),
    color: draft.color.trim(),
    description: draft.description.trim(),
    sortOrder: index + 1,
  }));
}
