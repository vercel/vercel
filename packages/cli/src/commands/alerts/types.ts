import type { GranularityLike } from '../../util/output/format-granularity';

export interface AlertAi {
  activityId?: string;
  version?: number;
  keyFindings?: string[];
  currentSummary?: string;
  title?: string;
  level?: string;
}

export interface AlertFormattedValues {
  changeAmount?: string;
  changeDirection?: string;
  formattedAvg?: string;
  formattedCount?: string;
  formattedThreshold?: string;
  errorRate?: string;
  avgErrorRate?: string;
}

export type AlertTriggerOperator = 'gt' | 'gte' | 'lt' | 'lte';
export type AlertTriggerType = 'threshold' | 'anomaly';

export interface CustomAlertFormula {
  operator?: 'divide';
  left?: string;
  right?: string;
}

export interface CustomAlertRollup {
  aggregation?: string;
  measure?: string;
  filter?: string;
}

export interface CustomAlertQuery {
  event?: string;
  rollups?: Record<string, CustomAlertRollup>;
  groupBy?: string[];
  filter?: string;
  granularity?: GranularityLike;
}

export type AlertFieldValue = string | number | boolean | null;

export interface AlertData {
  zscore?: number;
  fields?: Record<string, AlertFieldValue>;
  ruleId?: string;
  formula?: CustomAlertFormula;
  sonarQuery?: CustomAlertQuery;
  triggerOperator?: AlertTriggerOperator;
  triggerThreshold?: number;
  triggerType?: AlertTriggerType;
  minThreshold?: number;
  statusGroup?: string;
  route?: string;
  deploymentId?: string;
}

export interface Alert {
  id?: string;
  groupId?: string;
  teamId?: string;
  projectId?: string;
  type?: string;
  pipe?: string;
  status?: string;
  level?: string;
  title?: string;
  startedAt?: number;
  resolvedAt?: number;
  recordedStartedAt?: number;
  recordedResolvedAt?: number;
  rules?: string[];
  ai?: AlertAi;
  data?: AlertData;
  sonarQuery?: CustomAlertQuery;
  eventLabel?: string;
  measureLabel?: string;
  unit?: string;
  formattedValues?: AlertFormattedValues;
}

export interface AlertGroup {
  id?: string;
  teamId?: string;
  projectId?: string;
  title?: string;
  pipe?: string;
  level?: string;
  type?: string;
  status?: string;
  recordedStartedAt?: number;
  recordedResolvedAt?: number;
  updatedAt?: number;
  validatedAt?: number;
  version?: number;
  relatedGroupIds?: string[];
  ai?: AlertAi;
  alerts?: Alert[];
}

export interface AlertTypeConfig {
  type: string;
  filter?: string;
}

export interface NotificationConfig {
  slack?: string[];
  webhooks?: string[];
}

export interface CustomAlertMetricSource {
  formula?: CustomAlertFormula;
  queryJsonString?: string;
}

export interface CustomAlertDefinition extends CustomAlertMetricSource {
  id?: string;
  ruleId?: string;
  title?: string;
  triggerType?: AlertTriggerType;
  triggerOperator?: AlertTriggerOperator;
  triggerThreshold?: number;
  minThreshold?: number;
  createdAt?: number;
}

export interface AlertRule {
  id?: string;
  name?: string;
  teamId?: string;
  projectId?: string;
  odataFilters?: string;
  action?: string;
  alertTypes?: AlertTypeConfig[];
  sensitivityLevel?: number;
  notifications?: NotificationConfig[];
  isDefault?: boolean;
  autosubscribeOwnersInKnock?: boolean;
  autosubscribeProjectAdminsInKnock?: boolean;
  owner?: string;
  lastEditedByUserId?: string;
  customAlert?: CustomAlertDefinition;
}
