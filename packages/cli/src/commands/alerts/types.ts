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
  operator?: string;
  left?: string;
  right?: string;
}

export interface CustomAlertQuery {
  event?: string;
  rollups?: Record<string, { aggregation?: string; measure?: string }>;
  groupBy?: string[];
  granularity?: GranularityLike;
}

export type AlertFieldValue = string | number | boolean | null;

export interface AlertData {
  zscore?: number;
  fields?: Record<string, AlertFieldValue>;
  ruleId?: string;
  triggerOperator?: AlertTriggerOperator;
  triggerThreshold?: number;
  triggerType?: AlertTriggerType;
  minThreshold?: number;
  metric?: string;
  route?: string;
  statusGroup?: string;
  cause?: string;
  requestHostname?: string;
  action?: string;
  deploymentId?: string;
  path?: string;
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
