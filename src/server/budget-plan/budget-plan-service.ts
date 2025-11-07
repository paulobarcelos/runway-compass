// ABOUTME: Provides server actions for loading and saving budget plan data via Sheets.
import { getSession } from "@/server/auth/session";
import { createSheetsClient, type GoogleAuthTokens } from "@/server/google/clients";
import {
  createBudgetPlanRepository,
  type BudgetPlanRecord,
  type BudgetHorizonMetadata,
} from "@/server/google/repository/budget-horizon-repository";

interface Dependencies {
  getSession?: typeof getSession;
  createSheetsClient?: typeof createSheetsClient;
  createBudgetPlanRepository?: typeof createBudgetPlanRepository;
  now?: () => Date;
}

type SessionResult = Awaited<ReturnType<typeof getSession>>;

type BudgetPlanRepository = ReturnType<typeof createBudgetPlanRepository>;

type ResolvedDeps = Required<
  Pick<
    Dependencies,
    "getSession" | "createSheetsClient" | "createBudgetPlanRepository" | "now"
  >
>;

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

async function resolveRepository(spreadsheetId: string, deps: ResolvedDeps): Promise<BudgetPlanRepository> {
  const normalizedId = assertSpreadsheet(spreadsheetId);
  const session = await deps.getSession();
  const tokens = assertTokens(session);
  const sheets = deps.createSheetsClient(tokens);
  return deps.createBudgetPlanRepository({ sheets, spreadsheetId: normalizedId });
}

export interface GetBudgetPlanOptions {
  spreadsheetId: string;
}

export interface SaveBudgetPlanOptions extends GetBudgetPlanOptions {
  budgetPlan: BudgetPlanRecord[];
  metadata: BudgetHorizonMetadata;
}

export interface BudgetPlanPayload {
  budgetPlan: BudgetPlanRecord[];
  metadata: BudgetHorizonMetadata;
  updatedAt: string;
}

export function createBudgetPlanActions(dependencies: Dependencies = {}) {
  const deps: ResolvedDeps = {
    getSession: dependencies.getSession ?? getSession,
    createSheetsClient: dependencies.createSheetsClient ?? createSheetsClient,
    createBudgetPlanRepository:
      dependencies.createBudgetPlanRepository ?? createBudgetPlanRepository,
    now: dependencies.now ?? (() => new Date()),
  };

  async function getBudgetPlan({ spreadsheetId }: GetBudgetPlanOptions): Promise<BudgetPlanPayload> {
    const repository = await resolveRepository(spreadsheetId, deps);
    const { metadata, records } = await repository.load();

    return {
      budgetPlan: records,
      metadata,
      updatedAt: deps.now().toISOString(),
    };
  }

  async function saveBudgetPlan({
    spreadsheetId,
    budgetPlan,
    metadata,
  }: SaveBudgetPlanOptions): Promise<BudgetPlanPayload> {
    const repository = await resolveRepository(spreadsheetId, deps);
    await repository.save(budgetPlan, metadata);

    return {
      budgetPlan,
      metadata,
      updatedAt: deps.now().toISOString(),
    };
  }

  return {
    getBudgetPlan,
    saveBudgetPlan,
  };
}
