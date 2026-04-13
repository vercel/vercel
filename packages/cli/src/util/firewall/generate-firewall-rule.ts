import type Client from '../client';
import type { FirewallRule } from './types';

export interface GenerateFirewallRuleResponse {
  rule?: FirewallRule;
  error?: string;
}

interface GenerateOptions {
  teamId?: string;
}

export default async function generateFirewallRule(
  client: Client,
  projectId: string,
  body: { prompt: string; currentRule?: unknown },
  options: GenerateOptions = {}
): Promise<GenerateFirewallRuleResponse> {
  const { teamId } = options;

  const query = new URLSearchParams();
  query.set('projectId', projectId);
  if (teamId) query.set('teamId', teamId);

  const url = `/v1/security/firewall/config/generate-rule?${query.toString()}`;
  return client.fetch<GenerateFirewallRuleResponse>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
