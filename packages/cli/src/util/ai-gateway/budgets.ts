import type Client from '../client';

export type BudgetScopeType = 'team' | 'project';

// Scopes currently accepted as the `budgets set|remove <scope>` positional.
// `user` and `api-key` scopes are planned follow-ups.
export const BUDGET_SCOPE_TYPES: BudgetScopeType[] = ['team', 'project'];

export type ParsedBudgetScope =
  | { scopeType: 'team' }
  | { scopeType: 'project'; name: string };

/**
 * Parses the positional scope for `budgets set|remove`. The team identity stays
 * implicit (global `--scope`/`vc switch`); this positional selects the budget
 * dimension. Unknown or extra positionals are rejected rather than ignored, so a
 * mistyped scope can never silently target the wrong budget.
 */
export function parseBudgetScope(
  args: string[]
): { scope: ParsedBudgetScope } | { error: string } {
  const [scopeArg, ...rest] = args;

  if (!scopeArg) {
    return {
      error: `Expected a scope. Specify ${BUDGET_SCOPE_TYPES.join(' or ')}.`,
    };
  }

  if (!BUDGET_SCOPE_TYPES.includes(scopeArg as BudgetScopeType)) {
    return {
      error: `Unknown scope "${scopeArg}". Expected one of: ${BUDGET_SCOPE_TYPES.join(', ')}.`,
    };
  }

  if (scopeArg === 'team') {
    if (rest.length > 0) {
      return {
        error: `The team scope does not take a name (got "${rest[0]}").`,
      };
    }
    return { scope: { scopeType: 'team' } };
  }

  const [name, ...extra] = rest;
  if (!name) {
    return { error: 'The project scope requires a project name or id.' };
  }
  if (extra.length > 0) {
    return { error: `Unexpected argument "${extra[0]}".` };
  }
  return { scope: { scopeType: 'project', name } };
}

export type BudgetRefreshPeriod = 'daily' | 'weekly' | 'monthly' | 'none';

export type Budget = {
  quotaEntityId: string;
  scopeType: BudgetScopeType;
  scopeId: string;
  limitAmount: number;
  currentSpend: number;
  currentByokSpend: number;
  includeByokInQuota: boolean;
  refreshPeriod: BudgetRefreshPeriod;
  active: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

export type SetBudgetInput = {
  scopeType: BudgetScopeType;
  projectId?: string;
  limitAmount: number;
  refreshPeriod?: BudgetRefreshPeriod;
  includeByokInQuota?: boolean;
};

export async function listBudgets(
  client: Client,
  scopeType?: BudgetScopeType
): Promise<Budget[]> {
  const query = scopeType ? `?scopeType=${scopeType}` : '';
  const { budgets } = await client.fetch<{ budgets: Budget[] }>(
    `/ai-gateway/budgets/list${query}`,
    { method: 'GET' }
  );
  return budgets ?? [];
}

export async function setBudget(
  client: Client,
  input: SetBudgetInput
): Promise<Budget> {
  return client.fetch<Budget>('/ai-gateway/budgets', {
    method: 'PUT',
    body: input,
  });
}

export async function removeBudget(
  client: Client,
  scopeType: BudgetScopeType,
  projectId?: string
): Promise<void> {
  const params = new URLSearchParams({ scopeType });
  if (projectId) {
    params.set('projectId', projectId);
  }
  await client.fetch(`/ai-gateway/budgets?${params.toString()}`, {
    method: 'DELETE',
  });
}

// The tier that a default applies to. `team` is the team's own default limit;
// the per-* tiers apply to every project/api-key/user without an explicit budget.
export type BudgetDefaultTier =
  | 'perProjectLimit'
  | 'perApiKeyLimit'
  | 'perUserLimit';

// A single per-team default policy; one refreshPeriod is shared across tiers.
export type BudgetDefault = {
  teamId: string;
  teamLimit?: number;
  perProjectLimit?: number;
  perApiKeyLimit?: number;
  perUserLimit?: number;
  refreshPeriod: BudgetRefreshPeriod;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

// For each tier: a number sets it, null clears it, undefined leaves it unchanged.
export type UpsertBudgetDefaultInput = {
  perProjectLimit?: number | null;
  perApiKeyLimit?: number | null;
  perUserLimit?: number | null;
  refreshPeriod?: BudgetRefreshPeriod;
};

export async function getBudgetDefault(
  client: Client
): Promise<BudgetDefault | null> {
  // The endpoint returns 200 with a null body when no policy is set.
  const budgetDefault = await client.fetch<BudgetDefault | null>(
    '/ai-gateway/budgets/defaults',
    { method: 'GET' }
  );
  return budgetDefault ?? null;
}

export async function upsertBudgetDefault(
  client: Client,
  input: UpsertBudgetDefaultInput
): Promise<BudgetDefault> {
  return client.fetch<BudgetDefault>('/ai-gateway/budgets/defaults', {
    method: 'PUT',
    body: input,
  });
}

export async function archiveBudgetDefault(client: Client): Promise<void> {
  await client.fetch('/ai-gateway/budgets/defaults', { method: 'DELETE' });
}
