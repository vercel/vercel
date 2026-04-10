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

export interface FirewallConfigPatch {
  action: FirewallChangeAction;
  id?: string | null;
  value?: unknown;
}

export interface ProjectSecurityResponse {
  security?: {
    attackModeEnabled?: boolean;
    /** Epoch milliseconds */
    attackModeActiveUntil?: number | null;
    attackModeUpdatedAt?: number;
  };
}

export interface BypassRule {
  OwnerId: string;
  Id: string;
  Domain: string;
  Ip: string;
  ProjectId?: string;
  Note?: string;
  IsProjectRule?: boolean;
  CreatedAt?: string;
  /** Expiration time in epoch seconds */
  ExpiresAt?: number | null;
}

export interface BypassListResponse {
  result: BypassRule[];
  pagination?: { OwnerId: string; Id: string } | null;
}

export interface AddBypassRequest {
  sourceIp?: string;
  allSources?: boolean;
  domain?: string;
  projectScope?: boolean;
  note?: string;
  ttl?: number;
}

export interface AddBypassResponse {
  ok: boolean;
  result: BypassRule[];
  pagination: null;
}

export interface RemoveBypassRequest {
  sourceIp?: string;
  allSources?: boolean;
  domain?: string;
  projectScope?: boolean;
}

export interface RemoveBypassResponse {
  ok: boolean;
}

export interface UpdateAttackModeResponse {
  attackModeEnabled: boolean;
  /** Epoch milliseconds */
  attackModeUpdatedAt: number;
}
