import type Client from '../client';
import type { Page } from '../pagination';

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

/** One page of routing rules, oldest first. `next` is null on the last page. */
export async function listRulesPage(
  client: Client,
  opts: { limit?: number; next?: string; includeDisabled?: boolean } = {}
): Promise<Page<Rule>> {
  const query = new URLSearchParams();
  if (opts.limit !== undefined) {
    query.set('limit', String(opts.limit));
  }
  if (opts.next) {
    query.set('cursor', opts.next);
  }
  if (opts.includeDisabled) {
    query.set('includeDisabled', 'true');
  }
  const qs = query.toString();
  const { rules, nextCursor } = await client.fetch<{
    rules: Rule[];
    nextCursor?: string | null;
  }>(`/ai-gateway/rules${qs ? `?${qs}` : ''}`, { method: 'GET' });
  return { items: rules ?? [], next: nextCursor ?? null };
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
