import type Client from '../client';
import type { Page } from '../pagination';

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
  | { scopeType: 'team'; isDefault?: false }
  | {
      scopeType: 'project' | 'user' | 'api-key';
      name: string;
      isDefault?: false;
    }
  | { scopeType: BudgetDefaultScopeType; isDefault: true };

/**
 * Parses the `budgets set|inspect|remove` positional; typos are rejected,
 * never coerced. With `isDefault`, the scope targets the scope's default
 * budget instead of one resource: no name is accepted or required, and team
 * (which has no default) is rejected.
 */
export function parseBudgetScope(
  args: string[],
  opts: { isDefault?: boolean } = {}
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
    if (opts.isDefault) {
      return {
        error:
          'The team scope does not support --default. Set the team budget directly.',
      };
    }
    if (rest.length > 0) {
      return {
        error: `The team scope does not take a name (got "${rest[0]}").`,
      };
    }
    return { scope: { scopeType: 'team' } };
  }

  const [name, ...extra] = rest;
  if (opts.isDefault) {
    if (name) {
      return {
        error: `The ${scopeArg} scope takes either a name or --default, not both.`,
      };
    }
    return {
      scope: {
        scopeType: scopeArg as BudgetDefaultScopeType,
        isDefault: true,
      },
    };
  }
  if (!name) {
    const required = {
      project: 'a project name or id',
      user: 'a user email, username, or id',
      'api-key': 'an API key name or id',
    }[scopeArg as 'project' | 'user' | 'api-key'];
    return {
      error: `The ${scopeArg} scope requires ${required}. Pass --default for the per-${scopeArg} default budget.`,
    };
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

export type DefaultCoveredCounts = Partial<Record<BudgetSetScopeType, number>>;

export type BudgetsPage = Page<Budget> & {
  defaultCoveredCounts: DefaultCoveredCounts;
};

/** One page ordered by quotaEntityId, with counts across the full list. */
export async function listBudgetsPage(
  client: Client,
  opts: {
    scopeType?: BudgetSetScopeType;
    limit: number;
    next?: string;
    includeDefaultCovered?: boolean;
  }
): Promise<BudgetsPage> {
  const query = new URLSearchParams();
  if (opts.scopeType) {
    query.set('scopeType', opts.scopeType);
  }
  query.set('limit', String(opts.limit));
  if (opts.next) {
    query.set('cursor', opts.next);
  }
  if (opts.includeDefaultCovered !== undefined) {
    query.set('includeDefaultCovered', String(opts.includeDefaultCovered));
  }
  const { budgets, nextCursor, defaultCoveredCounts } = await client.fetch<{
    budgets: Budget[];
    nextCursor?: string | null;
    defaultCoveredCounts?: DefaultCoveredCounts;
  }>(`/ai-gateway/budgets/list?${query.toString()}`, { method: 'GET' });
  return {
    items: budgets ?? [],
    next: nextCursor ?? null,
    defaultCoveredCounts: defaultCoveredCounts ?? {},
  };
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

// Result copy shared by the set paths ("Applies to" row).
export const BUDGET_DEFAULT_APPLIES_TO: Record<BudgetDefaultScopeType, string> =
  {
    project: 'every project without its own budget',
    'api-key': 'every API key without its own budget',
    user: 'every team member without their own budget',
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
  // Omitted preserves the scope's existing cadence server-side (a brand-new
  // scope defaults to monthly).
  refreshPeriod?: BudgetRefreshPeriod;
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
