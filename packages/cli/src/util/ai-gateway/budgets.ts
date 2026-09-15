import type Client from '../client';

// `api-key` budgets are written through the api-keys quota endpoint instead.
export type BudgetScopeType = 'team' | 'project' | 'user';

export type BudgetSetScopeType = BudgetScopeType | 'api-key';

export const BUDGET_SCOPE_TYPES: BudgetSetScopeType[] = [
  'team',
  'project',
  'user',
  'api-key',
];

export type ParsedBudgetScope =
  | { scopeType: 'team' }
  | { scopeType: 'project'; name: string }
  | { scopeType: 'user'; name: string }
  | { scopeType: 'api-key'; name: string };

/** Parses the `budgets set|remove` positional; typos are rejected, never coerced. */
export function parseBudgetScope(
  args: string[]
): { scope: ParsedBudgetScope } | { error: string } {
  const [scopeArg, ...rest] = args;

  if (!scopeArg) {
    return {
      error: `Expected a scope. Specify ${BUDGET_SCOPE_TYPES.join(' or ')}.`,
    };
  }

  if (!BUDGET_SCOPE_TYPES.includes(scopeArg as BudgetSetScopeType)) {
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
    const required = {
      project: 'a project name or id',
      user: 'a user email, username, or id',
      'api-key': 'an API key name or id',
    }[scopeArg as 'project' | 'user' | 'api-key'];
    return { error: `The ${scopeArg} scope requires ${required}.` };
  }
  if (extra.length > 0) {
    return { error: `Unexpected argument "${extra[0]}".` };
  }
  return {
    scope: { scopeType: scopeArg as 'project' | 'user' | 'api-key', name },
  };
}

export type BudgetRefreshPeriod = 'daily' | 'weekly' | 'monthly' | 'none';

const PERIOD_PHRASE: Record<BudgetRefreshPeriod, string> = {
  daily: 'a day',
  weekly: 'a week',
  monthly: 'a month',
  none: 'total',
};

/** "$50 a month" for periodic budgets, "$50 total" for a cumulative one. */
export function formatBudgetCap(
  limitAmount: number,
  refreshPeriod: BudgetRefreshPeriod
): string {
  return `$${limitAmount} ${PERIOD_PHRASE[refreshPeriod]}`;
}

export type Budget = {
  quotaEntityId: string;
  scopeType: BudgetScopeType | 'api-key';
  scopeId: string;
  name?: string;
  limitAmount: number;
  currentSpend: number;
  currentByokSpend: number;
  includeByokInQuota: boolean;
  refreshPeriod: BudgetRefreshPeriod;
  active: boolean;
  archived: boolean;
  source?: 'default';
  createdAt: number;
  updatedAt: number;
};

export type SetBudgetInput = {
  scopeType: BudgetScopeType;
  projectId?: string;
  userId?: string;
  limitAmount: number;
  refreshPeriod?: BudgetRefreshPeriod;
  includeByokInQuota?: boolean;
};

export async function listBudgets(
  client: Client,
  scopeType?: BudgetSetScopeType
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
  opts: { projectId?: string; userId?: string } = {}
): Promise<void> {
  const params = new URLSearchParams({ scopeType });
  if (opts.projectId) {
    params.set('projectId', opts.projectId);
  }
  if (opts.userId) {
    params.set('userId', opts.userId);
  }
  await client.fetch(`/ai-gateway/budgets?${params.toString()}`, {
    method: 'DELETE',
  });
}

// The API may also store a team default row, which stays hidden.
export type BudgetDefaultScopeType = 'project' | 'api-key' | 'user';

export const BUDGET_DEFAULT_SCOPE_TYPES: BudgetDefaultScopeType[] = [
  'project',
  'api-key',
  'user',
];

export const BUDGET_DEFAULT_COVERED: Record<BudgetDefaultScopeType, string> = {
  project: 'Projects',
  'api-key': 'API keys',
  user: 'Team members',
};

export type ScopeBudgetDefault = {
  scopeType: BudgetDefaultScopeType | 'team';
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
