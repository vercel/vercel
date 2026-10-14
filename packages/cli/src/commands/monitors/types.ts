export type PublicAlertRuleType = 'built-in' | 'custom';

export type AlertRuleAuthoringOperation = 'create' | 'update';

export interface AlertRuleAuthoringExample {
  name: string;
  body: Record<string, unknown>;
}

export interface AlertRuleAuthoringOperationSchema {
  jsonSchema: Record<string, unknown>;
  examples: AlertRuleAuthoringExample[];
}

export interface AlertRuleAuthoringConstraint {
  code: string;
  kind: 'request' | 'resource-state' | 'availability';
  appliesTo: AlertRuleAuthoringOperation[];
  paths: string[];
  description: string;
}

export interface AlertRuleAuthoringRuleType {
  type: PublicAlertRuleType;
  description: string;
  create: AlertRuleAuthoringOperationSchema;
  update: AlertRuleAuthoringOperationSchema;
  metricDiscovery?: {
    command: string;
    description: string;
  };
  constraints: AlertRuleAuthoringConstraint[];
}

export interface AlertRuleAuthoringSchemaResponse {
  schemaVersion: number;
  ruleTypes: AlertRuleAuthoringRuleType[];
}

export const BUILT_IN_ALERT_TYPES = [
  'usage_anomaly',
  'error_anomaly',
  'botId_anomaly',
  'firewallSystemRule_anomaly',
  'firewallCustomRule_anomaly',
  'testAlert_anomaly',
  'buildTime_anomaly',
] as const;

export type BuiltInAlertType = (typeof BUILT_IN_ALERT_TYPES)[number];

export type BuiltInRuleScope =
  | { type: 'all' }
  | { type: 'include'; projectIds: string[] }
  | { type: 'exclude'; projectIds: string[] };

export type CustomRuleScope = { type: 'project'; projectId: string };

export interface NotificationSettings {
  enableTeamOwnerNotifications: boolean;
  incidentIoRoutingKey?: string;
}

export interface BuiltInTrigger {
  type: BuiltInAlertType;
  filter?: string;
}

export type BuiltInTriggers =
  | { mode: 'all' }
  | { mode: 'selected'; items: BuiltInTrigger[] };

export interface CustomAlertMetric {
  metric: string;
  aggregation: string;
  per?: 'second';
  normalize?: 'percent';
  dimensions?: string[];
  filter?: string;
}

export interface CustomAlertQuery {
  groupBy?: [string];
  filter?: string;
  metrics: Record<string, CustomAlertMetric>;
  formulas?: Record<string, string>;
  outputs: [string];
}

export interface MinimumTrigger {
  output: string;
  threshold: number;
}

export type CustomAlertTrigger =
  | {
      type: 'threshold';
      output: string;
      operator: 'gt' | 'gte' | 'lt' | 'lte';
      threshold: number;
      minimum?: MinimumTrigger;
    }
  | {
      type: 'anomaly';
      output: string;
      standardDeviations: number;
      minimum?: MinimumTrigger;
    };

interface AlertRuleMetadata {
  id: string;
  name: string;
  createdAt?: number;
  updatedAt?: number;
  isDefault: boolean;
  notificationSettings: NotificationSettings;
}

export interface BuiltInAlertRule extends AlertRuleMetadata {
  type: 'built-in';
  ruleScope: BuiltInRuleScope;
  triggers: BuiltInTriggers;
  matchMinimumSeverityLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface CustomAlertRuleBase extends AlertRuleMetadata {
  type: 'custom';
  ruleScope: CustomRuleScope;
  severity: 'low' | 'medium' | 'high';
}

export interface SupportedCustomAlertRule extends CustomAlertRuleBase {
  querySupported: true;
  evaluation: {
    window: '5m' | '1h' | '1d';
    query: CustomAlertQuery;
  };
  trigger: CustomAlertTrigger;
}

export interface UnsupportedCustomAlertRule extends CustomAlertRuleBase {
  querySupported: false;
  evaluation: null;
}

export type CustomAlertRule =
  | SupportedCustomAlertRule
  | UnsupportedCustomAlertRule;

export type PublicAlertRule = BuiltInAlertRule | CustomAlertRule;

export interface AlertRuleEnvelope {
  rule: PublicAlertRule;
}

export interface AlertRulesPage {
  rules: PublicAlertRule[];
  pagination: {
    count: number;
    next: string | null;
  };
}

export interface AlertRuleIssue {
  path: string;
  message: string;
}
