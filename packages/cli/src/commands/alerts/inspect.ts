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
import type { Alert, AlertFieldValue, AlertGroup } from './types';

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
  return humanizeReference(value)
    .split(/\s+/)
    .filter(Boolean)
    .map(word => {
      if (['ai', 'api', 'cpu', 'id', 'url', 'waf'].includes(word)) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
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

function appendUnit(value: string, unit: string | undefined): string {
  if (!unit || unit === 'ratio' || unit === 'score') {
    return value;
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
    rows.push(['Baseline', appendUnit(baseline, alert.unit)]);
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
  if (minThreshold !== undefined) {
    rows.push(['Minimum', appendUnit(formatNumber(minThreshold), alert.unit)]);
  }
  if (formattedValues.errorRate) {
    rows.push(['Error Rate', formattedValues.errorRate]);
  }
  if (formattedValues.avgErrorRate) {
    rows.push(['Baseline Error Rate', formattedValues.avgErrorRate]);
  }

  return rows;
}

function getDimensionRows(alert: Alert): string[][] {
  const fields = alert.data?.fields;
  if (!fields) {
    return [];
  }

  return Object.entries(fields).flatMap(([key, value]) => {
    const displayValue = formatAlertFieldValue(value);
    return displayValue ? [[humanizeLabel(key), displayValue]] : [];
  });
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

  addRow('Metric', data.metric);
  addRow('Route', data.route);
  addRow('Status Group', data.statusGroup);
  addRow('Cause', data.cause);
  addRow('Request Hostname', data.requestHostname);
  addRow('Action', data.action);
  addRow('Deployment ID', data.deploymentId);
  addRow('Path', data.path);

  return rows;
}

function renderAlert(alert: Alert, index: number, totalAlerts: number): string {
  const lines: string[] = [];
  const title = alert.title || `Alert ${index + 1}`;
  const ruleIds = getRuleIds(alert);

  lines.push(
    chalk.bold(totalAlerts > 1 ? `Alert ${index + 1}: ${title}` : title)
  );

  const summaryRows = [
    ['Alert id', alert.id || '-'],
    ['Type', alert.type || '-'],
    ['Status', alert.status || '-'],
    [
      'Started At',
      formatDate(
        normalizeTimestamp(alert.recordedStartedAt ?? alert.startedAt)
      ),
    ],
    ...(alert.resolvedAt !== undefined || alert.recordedResolvedAt !== undefined
      ? [
          [
            'Resolved At',
            formatDate(
              normalizeTimestamp(alert.recordedResolvedAt ?? alert.resolvedAt)
            ),
          ],
        ]
      : []),
    ...(ruleIds.length > 0
      ? [['Rule id', ruleIds.map(id => truncateMiddle(id, 48)).join(', ')]]
      : []),
  ];
  lines.push(renderAlertTable(summaryRows, 3));

  const signalRows = getSignalRows(alert);
  if (signalRows.length > 0) {
    lines.push(chalk.cyan('Signals'));
    lines.push(renderAlertTable(signalRows, 3));
  }

  const dimensionRows = getDimensionRows(alert);
  if (dimensionRows.length > 0) {
    lines.push(chalk.cyan('Dimensions'));
    lines.push(renderAlertTable(dimensionRows, 3));
  }

  const detailRows = getDetailRows(alert);
  if (detailRows.length > 0) {
    lines.push(chalk.cyan('Details'));
    lines.push(renderAlertTable(detailRows, 3));
  }

  return lines.join('\n');
}

function printAlertGroup(group: AlertGroup, groupId: string) {
  const alerts = group.alerts ?? [];
  const summaryRows = [
    ['Title', truncateEnd(getGroupTitle(group), 80)],
    ['Group id', group.id || groupId],
    ['Type', getGroupType(group)],
    ['Status', getGroupStatus(group)],
    ['Started At', formatDate(getGroupStartedAt(group))],
    ['Alerts', String(alerts.length)],
  ];
  const renderedAlerts =
    alerts.length > 0
      ? alerts
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
