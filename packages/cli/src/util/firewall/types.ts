// Types for the Vercel Firewall API responses.
// Only includes types needed by the current set of commands.
// Extended by later PRs as new commands are added.

export interface FirewallCondition {
  type: string;
  op: string;
  neg?: boolean;
  key?: string;
  value?: string | string[] | number;
}

export interface FirewallConditionGroup {
  conditions: FirewallCondition[];
}

export interface FirewallRateLimitConfig {
  algo: string;
  window: number;
  limit: number;
  keys: string[];
  action?: string;
}

export interface FirewallRedirectConfig {
  location: string;
  permanent: boolean;
}

export interface FirewallMitigateAction {
  action: string;
  rateLimit?: FirewallRateLimitConfig | null;
  redirect?: FirewallRedirectConfig | null;
  actionDuration?: string | null;
}

export interface FirewallRuleAction {
  mitigate?: FirewallMitigateAction;
}

export interface FirewallRule {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  conditionGroup: FirewallConditionGroup[];
  action: FirewallRuleAction;
  valid?: boolean;
  validationErrors?: string[];
}

export interface FirewallIpRule {
  id: string;
  ip: string;
  hostname: string;
  action: string;
  notes?: string;
}

export type FirewallChangeAction =
  | 'rules.insert'
  | 'rules.update'
  | 'rules.remove'
  | 'rules.priority'
  | 'ip.insert'
  | 'ip.remove'
  | 'ip.update'
  | 'firewallEnabled'
  | 'ja3Enabled'
  | 'ja4Enabled'
  | 'crs.update'
  | 'crs.disable'
  | 'managedRules.update'
  | 'managedRuleGroup.update'
  | 'botId.toggle'
  | 'logHeaders.update';

export interface FirewallConfigChange {
  action: FirewallChangeAction;
  id?: string | null;
  value?: unknown;
}

export interface ManagedRulesResponse {
  [key: string]: unknown;
}

export interface FirewallConfigResponse {
  ownerId: string;
  projectKey: string;
  id: string;
  version: number;
  updatedAt: string;
  firewallEnabled: boolean;
  crs?: unknown;
  rules: FirewallRule[];
  ips: FirewallIpRule[];
  changes: FirewallConfigChange[];
  managedRules?: ManagedRulesResponse;
  botIdEnabled?: boolean;
  logHeaders?: '*' | string[];
}

export interface FirewallConfigListResponse {
  active: FirewallConfigResponse | null;
  draft: FirewallConfigResponse | null;
  versions: FirewallConfigResponse[];
}

export interface BypassRule {
  OwnerId: string;
  Id: string;
  Domain?: string;
  Ip?: string;
  ProjectId?: string;
  Note?: string;
  IsProjectRule?: boolean;
}

export interface BypassListResponse {
  result: BypassRule[];
  pagination?: { OwnerId: string; Id: string } | null;
}
