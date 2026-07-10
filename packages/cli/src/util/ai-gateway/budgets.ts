import type Client from '../client';

export type BudgetScopeType = 'team' | 'project';

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
