import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { inspectSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import { isAPIError } from '../../util/errors-ts';
import { outputError } from '../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { packageName } from '../../util/pkg-name';
import { resolveAlertsScope } from './resolve-alerts-scope';
import formatDate from '../../util/format-date';
import chalk from 'chalk';
import {
  formatTriggerOperator,
  getGroupStartedAt,
  getGroupTitle,
  getGroupType,
  humanizeReference,
  normalizeTimestamp,
  renderAlertTable,
} from './format';
import { truncateEnd, truncateMiddle } from '../../util/output/truncate';
import type {
  Alert,
  AlertFieldValue,
  AlertGroup,
  CustomAlertRollup,
} from './types';
import { formatGranularity } from '../../util/output/format-granularity';

const aggregationLabels: Record<string, string> = {
  sum: 'Sum',
  avg: 'Average',
  min: 'Min',
  max: 'Max',
  p50: 'P50',
  p75: 'P75',
  p90: 'P90',
  p95: 'P95',
  p99: 'P99',
  stddev: 'Std Dev',
  unique: 'Unique',
  persecond: 'Per Second',
  percent: 'Percent',
};

const formatCustomAlertRatioBelowFivePercent = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: 'percent',
});
const formatCustomAlertRatioThresholdValue = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
  minimumFractionDigits: 0,
  style: 'percent',
});

function getGroupStatus(group: AlertGroup): string {
  if (group.status) {
    return group.status;
  }

  const alerts = group.alerts ?? [];
  if (alerts.some(alert => alert.status === 'active')) {
    return 'active';
  }
  if (alerts.length > 0) {
    return 'resolved';
  }

  return '-';
}

function humanizeLabel(value: string): string {
  return humanizeReference(value, { case: 'title' });
}

function formatAlertFieldValue(
  value: AlertFieldValue | undefined,
  maxLength = 64
): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const displayValue =
    typeof value === 'number' ? formatNumber(value) : String(value);
  if (!displayValue) {
    return undefined;
  }

  return truncateMiddle(displayValue, maxLength);
}

function formatNumber(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  for (const [threshold, suffix] of [
    [1_000_000_000, 'B'],
    [1_000_000, 'M'],
    [1_000, 'k'],
  ] as const) {
    if (absValue >= threshold) {
      return `${sign}${(absValue / threshold)
        .toFixed(1)
        .replace(/\.0$/, '')}${suffix}`;
    }
  }

  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/\.?0+$/, '');
}

function parseFormattedNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const number = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(number) ? number : undefined;
}

function formatRatio(value: string): string {
  if (value.trim().endsWith('%')) {
    return value;
  }

  const number = parseFormattedNumber(value);
  if (number === undefined) {
    return value;
  }

  const percent = number * 100;
  if (percent >= 5) {
    return `${Math.floor(percent)}%`;
  }

  return formatCustomAlertRatioBelowFivePercent.format(number);
}

function formatRatioThreshold(value: string): string {
  if (value.trim().endsWith('%')) {
    return value;
  }

  const number = parseFormattedNumber(value);
  return number === undefined
    ? value
    : formatCustomAlertRatioThresholdValue.format(number);
}

function getAlertSonarQuery(alert: Alert) {
  return alert.sonarQuery ?? alert.data?.sonarQuery;
}

function getCustomAlertBaselineTitle(alert: Alert): string {
  const granularity = getAlertSonarQuery(alert)?.granularity;
  const baseline =
    granularity && ('hours' in granularity || 'days' in granularity)
      ? '7-day baseline'
      : '24-hour baseline';

  return baseline.replace(/\b[a-z]/g, character => character.toUpperCase());
}

function appendUnit(value: string, unit: string | undefined): string {
  if (!unit || unit === 'score') {
    return value;
  }
  if (unit === 'ratio') {
    return formatRatio(value);
  }
  if (unit === '%') {
    return value.endsWith('%') ? value : `${value}%`;
  }
  if (value.toLowerCase().includes(unit.toLowerCase())) {
    return value;
  }

  return `${value} ${unit}`;
}

function formatThreshold(alert: Alert): string | undefined {
  const data = alert.data;
  const formatted =
    alert.formattedValues?.formattedThreshold ??
    (data?.triggerThreshold === undefined
      ? undefined
      : formatNumber(data.triggerThreshold));
  if (!formatted) {
    return undefined;
  }

  const operator = formatTriggerOperator(data?.triggerOperator);
  const threshold =
    data?.triggerType === 'anomaly'
      ? `${formatted} z-score`
      : alert.unit === 'ratio'
        ? formatRatioThreshold(formatted)
        : appendUnit(formatted, alert.unit);

  return [operator, threshold].filter(Boolean).join(' ');
}

function getRuleIds(alert: Alert): string[] {
  const ids = new Set<string>();
  const dataRuleId = alert.data?.ruleId;
  if (dataRuleId) {
    ids.add(dataRuleId);
  }
  for (const ruleId of alert.rules ?? []) {
    if (ruleId) {
      ids.add(ruleId);
    }
  }

  return [...ids];
}

function getAlertResolvedAt(alert: Alert): number | undefined {
  return normalizeTimestamp(alert.recordedResolvedAt ?? alert.resolvedAt);
}

function getSignalRows(alert: Alert): string[][] {
  const rows: string[][] = [];
  const formattedValues = alert.formattedValues ?? {};
  const observed = formattedValues.formattedCount;
  const baseline = formattedValues.formattedAvg;
  const change = [formattedValues.changeDirection, formattedValues.changeAmount]
    .filter(Boolean)
    .join(' ');
  const zscore = alert.data?.zscore;
  const threshold = formatThreshold(alert);
  const minThreshold = alert.data?.minThreshold;
  const isRatioFormulaAlert = Boolean(getCustomAlertFormula(alert));

  if (alert.eventLabel) {
    rows.push(['Event', alert.eventLabel]);
  }
  if (alert.measureLabel) {
    rows.push(['Measure', alert.measureLabel]);
  }
  if (observed) {
    rows.push(['Observed Value', appendUnit(observed, alert.unit)]);
  }
  if (baseline) {
    rows.push([
      alert.type === 'custom_alert' && alert.data?.triggerType === 'anomaly'
        ? getCustomAlertBaselineTitle(alert)
        : 'Baseline',
      appendUnit(baseline, alert.unit),
    ]);
  }
  if (change) {
    rows.push(['Change', change]);
  }
  if (zscore !== undefined) {
    rows.push(['Observed Deviation', `${formatNumber(zscore)} z-score`]);
  }
  if (threshold) {
    rows.push(['Threshold', threshold]);
  }
  if (minThreshold !== undefined && !isRatioFormulaAlert) {
    rows.push([
      'Minimum',
      alert.unit === 'ratio'
        ? formatNumber(minThreshold)
        : appendUnit(formatNumber(minThreshold), alert.unit),
    ]);
  }
  if (formattedValues.errorRate) {
    rows.push(['Error Rate', formattedValues.errorRate]);
  }
  if (formattedValues.avgErrorRate) {
    rows.push(['Baseline Error Rate', formattedValues.avgErrorRate]);
  }
  rows.push(...getFieldRows(alert));

  return rows;
}

function getFieldRows(alert: Alert): string[][] {
  const fields = alert.data?.fields;
  if (!fields) {
    return [];
  }

  const groupBy = getAlertSonarQuery(alert)?.groupBy ?? [];
  const fieldKeys = [
    ...groupBy,
    ...Object.keys(fields).filter(key => !groupBy.includes(key)),
  ];

  return fieldKeys.flatMap(key => {
    const value = fields[key];
    const displayValue = formatAlertFieldValue(value);
    return displayValue ? [[humanizeLabel(key), displayValue]] : [];
  });
}

function formatAggregation(value: string | undefined): string | undefined {
  return value ? (aggregationLabels[value] ?? humanizeLabel(value)) : undefined;
}

function formatQueryReference(value: string | undefined): string | undefined {
  return value ? humanizeLabel(value) : undefined;
}

function formatRollupDetail(
  rollup: CustomAlertRollup | undefined,
  fallbackMeasure?: string
): string | undefined {
  if (!rollup) {
    return undefined;
  }

  const aggregation = formatAggregation(rollup.aggregation);
  const measure = fallbackMeasure ?? formatQueryReference(rollup.measure);
  const detail = [aggregation, measure].filter(Boolean).join(' ');

  return detail || undefined;
}

function getPrimaryRollup(
  rollups: Record<string, CustomAlertRollup> | undefined
): CustomAlertRollup | undefined {
  return Object.values(rollups ?? {})[0];
}

function getCustomAlertFormula(
  alert: Alert
): { operator: 'divide'; left: string; right: string } | undefined {
  const formula = alert.data?.formula;
  if (formula?.operator === 'divide' && formula.left && formula.right) {
    return {
      operator: formula.operator,
      left: formula.left,
      right: formula.right,
    };
  }

  return undefined;
}

function getQueryRows(alert: Alert): string[][] {
  if (alert.type !== 'custom_alert') {
    return [];
  }

  const query = getAlertSonarQuery(alert);
  if (!query) {
    return [];
  }

  const formula = getCustomAlertFormula(alert);
  const rows: string[][] = [];
  const addRow = (label: string, value: string | undefined) => {
    if (value) {
      rows.push([label, truncateMiddle(value, 120)]);
    }
  };

  addRow('Event', alert.eventLabel ?? formatQueryReference(query.event));

  if (formula) {
    addRow('Numerator', formatRollupDetail(query.rollups?.[formula.left]));
    addRow('Denominator', formatRollupDetail(query.rollups?.[formula.right]));
  } else {
    const primaryRollup = getPrimaryRollup(query.rollups);
    addRow(
      'Measure',
      alert.measureLabel ?? formatQueryReference(primaryRollup?.measure)
    );
    addRow('Aggregation', formatAggregation(primaryRollup?.aggregation));
  }

  addRow('Granularity', formatGranularity(query.granularity));

  const groupBy = query.groupBy?.filter(Boolean) ?? [];
  if (groupBy.length > 0) {
    addRow('Group by', groupBy.map(humanizeLabel).join(', '));
  }

  if (formula && typeof alert.data?.minThreshold === 'number') {
    addRow('Minimum Numerator', formatNumber(alert.data.minThreshold));
  }

  addRow('Filter by', query.filter?.trim());

  if (formula) {
    for (const [label, rollupName] of [
      ['Numerator filter', formula.left],
      ['Denominator filter', formula.right],
    ] as const) {
      addRow(label, query.rollups?.[rollupName]?.filter?.trim());
    }
  }

  return rows;
}

function getDetailRows(alert: Alert): string[][] {
  const data = alert.data;
  if (!data) {
    return [];
  }

  const rows: string[][] = [];
  const addRow = (label: string, value: AlertFieldValue | undefined) => {
    const displayValue = formatAlertFieldValue(value);
    if (displayValue) {
      rows.push([label, displayValue]);
    }
  };

  addRow('Route', data.route);
  addRow('Status Group', data.statusGroup);
  addRow('Deployment ID', data.deploymentId);

  return rows;
}

function renderAlertSections(alert: Alert): string {
  const lines: string[] = [];

  const signalRows = getSignalRows(alert);
  if (signalRows.length > 0) {
    lines.push(chalk.cyan('Signals'));
    lines.push(renderAlertTable(signalRows, 3));
  }

  const queryRows = getQueryRows(alert);
  if (queryRows.length > 0) {
    lines.push(chalk.cyan('Query'));
    lines.push(renderAlertTable(queryRows, 3));
  }

  return lines.join('\n');
}

function renderAlert(alert: Alert, index: number, totalAlerts: number): string {
  const title = alert.title || `Alert ${index + 1}`;
  const ruleIds = getRuleIds(alert);
  const resolvedAt = getAlertResolvedAt(alert);
  const sections = renderAlertSections(alert);
  const summaryRows: string[][] = [
    ['Alert id', alert.id || '-'],
    ['Type', alert.type || '-'],
    ['Status', alert.status || '-'],
    [
      'Started At',
      formatDate(
        normalizeTimestamp(alert.recordedStartedAt ?? alert.startedAt)
      ),
    ],
    ...(resolvedAt !== undefined
      ? [['Resolved At', formatDate(resolvedAt)]]
      : []),
    ...(ruleIds.length > 0
      ? [['Rule id', ruleIds.map(id => truncateMiddle(id, 48)).join(', ')]]
      : []),
    ...getDetailRows(alert),
  ];

  return [
    chalk.bold(totalAlerts > 1 ? `Alert ${index + 1}: ${title}` : title),
    renderAlertTable(summaryRows, 3),
    ...(sections ? [sections] : []),
  ].join('\n');
}

function printAlertGroup(group: AlertGroup, groupId: string) {
  const alerts = group.alerts ?? [];
  const singleAlert = alerts.length === 1 ? alerts[0] : undefined;
  const singleAlertRuleIds = singleAlert ? getRuleIds(singleAlert) : [];
  const singleAlertResolvedAt = singleAlert
    ? getAlertResolvedAt(singleAlert)
    : undefined;
  const summaryRows: string[][] = [
    ['Title', truncateEnd(getGroupTitle(group), 80)],
    ['Group id', group.id || groupId],
    ['Type', getGroupType(group)],
    ['Status', getGroupStatus(group)],
    ['Started At', formatDate(getGroupStartedAt(group))],
    ...(singleAlertResolvedAt !== undefined
      ? [['Resolved At', formatDate(singleAlertResolvedAt)]]
      : []),
    ['Alerts', String(alerts.length)],
    ...(singleAlert?.id ? [['Alert id', singleAlert.id]] : []),
    ...(singleAlertRuleIds.length > 0
      ? [
          [
            'Rule id',
            singleAlertRuleIds.map(id => truncateMiddle(id, 48)).join(', '),
          ],
        ]
      : []),
    ...(singleAlert ? getDetailRows(singleAlert) : []),
  ];
  const renderedAlerts =
    alerts.length > 0
      ? alerts.length === 1
        ? renderAlertSections(alerts[0])
        : alerts
            .map((alert, index) => renderAlert(alert, index, alerts.length))
            .join('\n\n')
      : 'No alerts in this group.';

  output.print(
    [
      '',
      `${chalk.bold('Alert group')} ${chalk.cyan(group.id || groupId)}`,
      renderAlertTable(summaryRows, 3),
      '',
      renderedAlerts,
      '',
    ].join('\n')
  );
}

export default async function inspect(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const spec = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, spec);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const projectFlagMissingArg =
      msg.includes('--project') && msg.includes('requires argument');
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: projectFlagMissingArg
          ? '`--project` requires a project name or id (for example `--project my-app`).'
          : msg,
        next: projectFlagMissingArg
          ? [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'alerts inspect <groupId> --project <name-or-id>'
                ),
                when: 'Re-run with placeholders replaced',
              },
            ]
          : [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'alerts inspect --help'
                ),
                when: 'See valid `alerts inspect` usage',
              },
            ],
      },
      1
    );
    printError(e);
    return 1;
  }

  const groupId = parsedArgs.args[0];
  const fr = validateJsonOutput(parsedArgs.flags);
  if (!fr.valid) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: fr.error,
      },
      1
    );
    output.error(fr.error);
    return 1;
  }

  if (!groupId) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: `Missing group id. Example: ${packageName} alerts inspect <groupId>`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'alerts inspect <groupId>'
            ),
            when: 'Replace <groupId> with a group id from `vercel alerts`',
          },
        ],
      },
      1
    );
    return outputError(
      client,
      fr.jsonOutput,
      'MISSING_ARGUMENTS',
      'Usage: `vercel alerts inspect <groupId>`'
    );
  }

  const scope = await resolveAlertsScope(client, {
    project: parsedArgs.flags['--project'] as string | undefined,
    all: parsedArgs.flags['--all'] as boolean | undefined,
    jsonOutput: fr.jsonOutput,
    command: `alerts inspect ${groupId}`,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const query = new URLSearchParams({ teamId: scope.teamId });
  if (scope.projectId) {
    query.set('projectId', scope.projectId);
  }

  const path = `/alerts/v3/groups/${encodeURIComponent(groupId)}?${query.toString()}`;
  output.spinner('Fetching alert group...');
  try {
    const group = await client.fetch<AlertGroup>(path);
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify({ group }, null, 2)}\n`);
    } else {
      printAlertGroup(group, groupId);
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      const msg = err.serverMessage || `API error (${err.status}).`;
      const reason =
        err.status === 401
          ? 'not_authorized'
          : err.status === 403
            ? 'forbidden'
            : err.status === 404
              ? AGENT_REASON.NOT_FOUND
              : err.status === 429
                ? 'rate_limited'
                : AGENT_REASON.API_ERROR;
      outputAgentError(
        client,
        {
          status: 'error',
          reason,
          message: msg,
          ...(err.status === 401 || err.status === 403
            ? {
                hint: 'Confirm team scope; use --scope <team-slug> if the group belongs to another team.',
                next: [
                  {
                    command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
                    when: 'See current user and team',
                  },
                  {
                    command: buildCommandWithGlobalFlags(
                      client.argv,
                      `alerts inspect ${groupId}`
                    ),
                    when: 'Retry after fixing scope or permissions',
                  },
                ],
              }
            : {}),
        },
        1
      );
      return outputError(client, fr.jsonOutput, err.code || 'API_ERROR', msg);
    }
    throw err;
  } finally {
    output.stopSpinner();
  }
}
