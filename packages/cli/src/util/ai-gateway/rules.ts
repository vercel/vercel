import type Client from '../client';

export type RuleType = 'rewrite' | 'deny';

export type RuleMatch = {
  model?: string;
};

export type RuleAction = {
  rewriteModel?: string;
  reason?: string;
};

export type Rule = {
  ownerId: string;
  ruleId: string;
  type: RuleType;
  match?: RuleMatch;
  action?: RuleAction;
  enabled?: boolean;
  deleted?: boolean;
  description?: string;
  createdAt: number;
  updatedAt: number;
};

export type CreateRuleInput = {
  type: RuleType;
  match?: RuleMatch;
  action?: RuleAction;
  description?: string;
};

export type UpdateRuleInput = {
  ruleId: string;
  enabled?: boolean;
  description?: string;
  action?: RuleAction;
};

export async function createRule(
  client: Client,
  input: CreateRuleInput
): Promise<Rule> {
  return client.fetch<Rule>('/ai-gateway/rules', {
    method: 'POST',
    body: input,
  });
}

export async function listRules(
  client: Client,
  includeDisabled = false
): Promise<Rule[]> {
  const query = includeDisabled ? '?includeDisabled=true' : '';
  const { rules } = await client.fetch<{ rules: Rule[] }>(
    `/ai-gateway/rules${query}`,
    { method: 'GET' }
  );
  return rules ?? [];
}

export async function updateRule(
  client: Client,
  input: UpdateRuleInput
): Promise<Rule> {
  return client.fetch<Rule>('/ai-gateway/rules', {
    method: 'PATCH',
    body: input,
  });
}

export async function deleteRule(
  client: Client,
  ruleId: string
): Promise<void> {
  await client.fetch(`/ai-gateway/rules?ruleId=${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
  });
}
