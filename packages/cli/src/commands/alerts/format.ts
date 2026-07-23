import indent from '../../util/output/indent';
import table from '../../util/output/table';
import { truncateMiddle } from '../../util/output/truncate';
import { humanizeIdentifier } from '../../util/openapi/column-label';
import type {
  Alert,
  AlertGroup,
  AlertRule,
  AlertTriggerOperator,
  AlertTriggerType,
  CustomAlertFormula,
  CustomAlertMetricSource,
  CustomAlertQuery,
} from './types';

export function renderAlertTable(rows: string[][], hsep = 3): string {
  return indent(
    table(rows, { hsep })
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n'),
    2
  );
}

export function normalizeTimestamp(
  value: number | undefined
): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.abs(value) < 1_000_000_000_000 ? value * 1000 : value;
}

export function getPrimaryAlert(group: AlertGroup): Alert | undefined {
  return group.alerts?.[0];
}

export function getGroupTitle(group: AlertGroup): string {
  return (
    group.ai?.title ||
    group.title ||
    getPrimaryAlert(group)?.title ||
    'Alert group'
  );
}

export function getGroupType(group: AlertGroup): string {
  return group.type || getPrimaryAlert(group)?.type || '-';
}

export function getGroupStartedAt(group: AlertGroup): number | undefined {
  const primaryAlert = getPrimaryAlert(group);
  return normalizeTimestamp(
    group.recordedStartedAt ??
      primaryAlert?.recordedStartedAt ??
      primaryAlert?.startedAt
  );
}

export function formatTriggerOperator(
  value: AlertTriggerOperator | undefined
): string | undefined {
  switch (value) {
    case 'gt':
      return '>';
    case 'gte':
      return '>=';
    case 'lt':
      return '<';
    case 'lte':
      return '<=';
    default:
      return undefined;
  }
}

export function humanizeReference(
  value: string,
  opts: { case?: 'title' | 'lower' } = {}
): string {
  return value
    .split('/')
    .map(part => {
      const label = humanizeIdentifier(part);
      return opts.case === 'title' ? label : label.toLowerCase();
    })
    .join(' / ');
}

export function formatRuleScope(
  projectId: string | undefined,
  {
    projectIdMaxLength = 48,
    filterMaxLength = 80,
  }: {
    projectIdMaxLength?: number;
    filterMaxLength?: number;
  } = {}
): string {
  if (!projectId) {
    return 'team-wide';
  }

  const projectIdMatch = projectId.match(/^projectId eq '([^']+)'$/);
  if (projectIdMatch?.[1]) {
    return `project: ${truncateMiddle(projectIdMatch[1], projectIdMaxLength)}`;
  }
  if (!/\s/.test(projectId)) {
    return `project: ${truncateMiddle(projectId, projectIdMaxLength)}`;
  }

  return `project filter: ${truncateMiddle(projectId, filterMaxLength)}`;
}

export function isCustomAlertRule(rule: {
  alertTypes?: AlertRule['alertTypes'];
  customAlert?: AlertRule['customAlert'];
}): boolean {
  return (
    Boolean(rule.customAlert) ||
    Boolean(
      rule.alertTypes?.some(alertType => alertType.type === 'custom_alert')
    )
  );
}

export function formatCustomAlertTrigger(customAlert: {
  triggerType?: AlertTriggerType;
  triggerOperator?: AlertTriggerOperator;
  triggerThreshold?: number;
}): string | undefined {
  const operator = formatTriggerOperator(customAlert.triggerOperator);
  const threshold =
    typeof customAlert.triggerThreshold === 'number'
      ? String(customAlert.triggerThreshold)
      : undefined;
  const trigger =
    customAlert.triggerType === 'anomaly'
      ? `z-score ${[operator, threshold].filter(Boolean).join(' ')}`
      : ['threshold', operator, threshold].filter(Boolean).join(' ');

  return trigger || undefined;
}

export function parseCustomAlertQuery(
  value: string | undefined
): CustomAlertQuery {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as CustomAlertQuery;
  } catch {
    return {};
  }
}

function formatFormula(
  formula: CustomAlertFormula | undefined
): string | undefined {
  if (!formula?.left || !formula.right) {
    return undefined;
  }

  switch (formula.operator) {
    case 'divide':
      return `${humanizeReference(formula.left)} / ${humanizeReference(
        formula.right
      )}`;
    default:
      return undefined;
  }
}

export function formatCustomAlertMetric(
  customAlert: CustomAlertMetricSource
): string | undefined {
  const formula = formatFormula(customAlert.formula);
  if (formula) {
    return formula;
  }

  const query = parseCustomAlertQuery(customAlert.queryJsonString);
  const firstRollup = Object.values(query.rollups ?? {})[0];
  const parts = [query.event, firstRollup?.aggregation, firstRollup?.measure];
  const base = parts
    .flatMap(part => (part ? [humanizeReference(part)] : []))
    .join(' ');
  const groupBy = query.groupBy ?? [];

  if (base && groupBy.length > 0) {
    return `${base} by ${groupBy
      .map(value => humanizeReference(value))
      .join(', ')}`;
  }

  return base || undefined;
}
