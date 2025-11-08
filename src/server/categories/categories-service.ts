// ABOUTME: Provides shared helpers for categories server actions and API reuse.
import { getSession } from "@/server/auth/session";
import { createSheetsClient, type GoogleAuthTokens } from "@/server/google/clients";
import {
  createCategoriesRepository,
  type CategoryRecord,
} from "@/server/google/repository/categories-repository";

interface Dependencies {
  getSession?: typeof getSession;
  createSheetsClient?: typeof createSheetsClient;
  createCategoriesRepository?: typeof createCategoriesRepository;
  now?: () => Date;
}

export interface CategoryInput {
  categoryId: string;
  label: string;
  color: string;
  description: string;
  sortOrder: number;
}

type SessionResult = Awaited<ReturnType<typeof getSession>>;

type CategoryRepository = ReturnType<typeof createCategoriesRepository>;

type ResolvedDeps = Required<Pick<Dependencies, "getSession" | "createSheetsClient" | "createCategoriesRepository" | "now">>;

function assertSpreadsheet(spreadsheetId: string | null | undefined) {
  if (!spreadsheetId || !spreadsheetId.trim()) {
    throw new Error("Missing spreadsheetId");
  }
  return spreadsheetId.trim();
}

function assertTokens(session: SessionResult | null): GoogleAuthTokens {
  if (!session) {
    throw new Error("Missing authenticated session");
  }

  const tokens = session.googleTokens;

  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    throw new Error("Missing Google tokens");
  }

  return tokens;
}

export function sanitizeCategoriesInput(raw: CategoryInput[]): CategoryRecord[] {
  const normalized = raw
    .map((item) => ({
      categoryId: String(item.categoryId ?? "").trim(),
      label: String(item.label ?? "").trim(),
      color: String(item.color ?? "").trim(),
      description: String(item.description ?? "").trim(),
      sortOrder: Number.isFinite(item.sortOrder) ? Number(item.sortOrder) : 0,
    }))
    .filter((item) => item.categoryId && item.label);

  normalized.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }

    return a.label.localeCompare(b.label);
  });

  return normalized.map((item, index) => ({
    ...item,
    sortOrder: index + 1,
  }));
}

async function resolveRepository(
  spreadsheetId: string,
  deps: ResolvedDeps,
): Promise<CategoryRepository> {
  const resolvedId = assertSpreadsheet(spreadsheetId);
  const session = await deps.getSession();
  const tokens = assertTokens(session);
  const sheets = deps.createSheetsClient(tokens);
  return deps.createCategoriesRepository({ sheets, spreadsheetId: resolvedId });
}

export function createCategoriesActions(dependencies: Dependencies = {}) {
  const deps: ResolvedDeps = {
    getSession: dependencies.getSession ?? getSession,
    createSheetsClient: dependencies.createSheetsClient ?? createSheetsClient,
    createCategoriesRepository:
      dependencies.createCategoriesRepository ?? createCategoriesRepository,
    now: dependencies.now ?? (() => new Date()),
  };

  async function getCategories({ spreadsheetId }: { spreadsheetId: string }) {
    const repository = await resolveRepository(spreadsheetId, deps);
    const categories = await repository.list();
    return sanitizeCategoriesInput(categories);
  }

  async function saveCategories({
    spreadsheetId,
    categories,
  }: {
    spreadsheetId: string;
    categories: CategoryInput[];
  }) {
    const repository = await resolveRepository(spreadsheetId, deps);
    const sanitized = sanitizeCategoriesInput(categories);
    await repository.save(sanitized);
    return {
      categories: sanitized,
      updatedAt: deps.now().toISOString(),
    } as const;
  }

  return {
    getCategories,
    saveCategories,
  };
}
