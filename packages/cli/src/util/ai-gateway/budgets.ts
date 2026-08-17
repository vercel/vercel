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

// Scopes exposed as `budgets defaults set|remove <scope>`. The API also stores
// `team` and `user` defaults, but the CLI (like the dashboard) only surfaces the
// project and api-key tiers; `user` isn't released yet.
export type BudgetDefaultScopeType = 'project' | 'api-key';

export const BUDGET_DEFAULT_SCOPE_TYPES: BudgetDefaultScopeType[] = [
  'project',
  'api-key',
];

// Each scope keeps its own limit and refreshPeriod (per-scope, not a single
// concatenated policy). The list endpoint may also return team/user rows.
export type ScopeBudgetDefault = {
  scopeType: BudgetDefaultScopeType | 'team' | 'user';
  limitAmount: number;
  refreshPeriod: BudgetRefreshPeriod;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

export type UpsertScopeBudgetDefaultInput = {
  scopeType: BudgetDefaultScopeType;
  limitAmount: number;
  refreshPeriod: BudgetRefreshPeriod;
};

export function parseBudgetDefaultScope(
  args: string[]
): { scopeType: BudgetDefaultScopeType } | { error: string } {
  const [scopeArg, ...rest] = args;

  if (!scopeArg) {
    return {
      error: `Expected a scope. Specify ${BUDGET_DEFAULT_SCOPE_TYPES.join(' or ')}.`,
    };
  }
  if (
    !BUDGET_DEFAULT_SCOPE_TYPES.includes(scopeArg as BudgetDefaultScopeType)
  ) {
    return {
      error: `Unknown scope "${scopeArg}". Expected one of: ${BUDGET_DEFAULT_SCOPE_TYPES.join(', ')}.`,
    };
  }
  if (rest.length > 0) {
    return { error: `Unexpected argument "${rest[0]}".` };
  }
  return { scopeType: scopeArg as BudgetDefaultScopeType };
}

export async function listScopeBudgetDefaults(
  client: Client
): Promise<ScopeBudgetDefault[]> {
  const { defaults } = await client.fetch<{ defaults: ScopeBudgetDefault[] }>(
    '/ai-gateway/budgets/defaults/list',
    { method: 'GET' }
  );
  return defaults ?? [];
}

export async function upsertScopeBudgetDefault(
  client: Client,
  input: UpsertScopeBudgetDefaultInput
): Promise<ScopeBudgetDefault> {
  return client.fetch<ScopeBudgetDefault>('/ai-gateway/budgets/defaults', {
    method: 'PUT',
    body: input,
  });
}

export async function deleteScopeBudgetDefault(
  client: Client,
  scopeType: BudgetDefaultScopeType
): Promise<void> {
  const params = new URLSearchParams({ scopeType });
  await client.fetch(`/ai-gateway/budgets/defaults?${params.toString()}`, {
    method: 'DELETE',
  });
}
