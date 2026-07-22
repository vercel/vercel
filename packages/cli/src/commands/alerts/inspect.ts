import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { inspectSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import getScope from '../../util/get-scope';
import { getLinkedProject } from '../../util/projects/link';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { isAPIError, ProjectNotFound } from '../../util/errors-ts';
import {
  outputError,
  handleValidationError,
  validateAllProjectMutualExclusivity,
} from '../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { packageName } from '../../util/pkg-name';
import { emitAlertsScopeError } from './resolve-alerts-scope';
import formatDate from '../../util/format-date';
import chalk from 'chalk';
import {
  formatTriggerOperator,
  humanizeReference,
  normalizeTimestamp,
  renderAlertTable,
} from './format';
import { truncateEnd, truncateMiddle } from '../../util/output/truncate';

type AlertScope = { teamId: string; projectId?: string };

interface Ai {
  title?: string;
  currentSummary?: string;
  keyFindings?: string[];
}

interface FormattedValues {
  changeAmount?: string;
  changeDirection?: string;
  formattedAvg?: string;
  formattedCount?: string;
  formattedThreshold?: string;
  errorRate?: string;
  avgErrorRate?: string;
}

interface Alert {
  id?: string;
  groupId?: string;
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
  data?: Record<string, unknown>;
  eventLabel?: string;
  measureLabel?: string;
  unit?: string;
  formattedValues?: FormattedValues;
}

interface AlertGroup {
  id?: string;
  teamId?: string;
  projectId?: string;
  title?: string;
  type?: string;
  pipe?: string;
  status?: string;
  level?: string;
  recordedStartedAt?: number;
  recordedResolvedAt?: number;
  updatedAt?: number;
  ai?: Ai;
  alerts?: Alert[];
}

const detailKeysToSkip = new Set([
  'average',
  'count',
  'customAlertDefinitionId',
  'fields',
  'formula',
  'minThreshold',
  'sonarQuery',
  'stddev',
  'title',
  'triggerOperator',
  'triggerThreshold',
  'triggerType',
  'zscore',
]);

function getPrimaryAlert(group: AlertGroup): Alert | undefined {
  return group.alerts?.[0];
}

function getGroupTitle(group: AlertGroup): string {
  return (
    group.ai?.title ||
    group.title ||
    getPrimaryAlert(group)?.title ||
    'Alert group'
  );
}

function getGroupType(group: AlertGroup): string {
  return group.type || getPrimaryAlert(group)?.type || '-';
}

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

function getGroupStartedAt(group: AlertGroup): number | undefined {
  return normalizeTimestamp(
    group.recordedStartedAt ??
    getPrimaryAlert(group)?.recordedStartedAt ??
    getPrimaryAlert(group)?.startedAt
  );
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

function formatScalar(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const values = value.map(formatScalar).filter(Boolean);
    return values.length > 0 ? values.join(', ') : undefined;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return undefined;
}

function formatDisplayValue(value: unknown, maxLength = 80): string {
  const scalar = formatScalar(value);
  if (!scalar) {
    return '-';
  }

  return truncateMiddle(scalar, maxLength);
}

function getDataNumber(
  data: Record<string, unknown> | undefined,
  key: string
): number | undefined {
  const value = data?.[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function formatNumber(value: number): string {
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
    formatScalar(getDataNumber(data, 'triggerThreshold'));
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
  if (typeof dataRuleId === 'string' && dataRuleId) {
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
  const zscore = getDataNumber(alert.data, 'zscore');
  const threshold = formatThreshold(alert);
  const minThreshold = getDataNumber(alert.data, 'minThreshold');

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
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return [];
  }

  return Object.entries(fields)
    .map(([key, value]) => [humanizeLabel(key), formatDisplayValue(value, 64)])
    .filter(([, value]) => value !== '-');
}

function getDetailRows(alert: Alert): string[][] {
  const data = alert.data;
  if (!data) {
    return [];
  }

  const ruleIds = new Set(getRuleIds(alert));
  return Object.entries(data)
    .filter(([key, value]) => {
      if (detailKeysToSkip.has(key)) {
        return false;
      }
      if (key === 'ruleId' && typeof value === 'string' && ruleIds.has(value)) {
        return false;
      }
      return formatScalar(value) !== undefined;
    })
    .map(([key, value]) => [humanizeLabel(key), formatDisplayValue(value, 64)]);
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
      formatDate(normalizeTimestamp(alert.recordedStartedAt ?? alert.startedAt)),
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

async function resolveInspectScope(
  client: Client,
  flags: {
    '--project'?: string;
    '--all'?: boolean;
  },
  jsonOutput: boolean
): Promise<AlertScope | number> {
  const mutual = validateAllProjectMutualExclusivity(
    flags['--all'],
    flags['--project']
  );
  if (!mutual.valid) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: mutual.message,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'alerts inspect <groupId> --help'
            ),
            when: 'Use either `--project` or `--all`, not both',
          },
        ],
      },
      1
    );
    return handleValidationError(mutual, jsonOutput, client);
  }

  if (flags['--all']) {
    const { team } = await getScope(client);
    if (!team) {
      const msg =
        'No team context found. Run `vercel switch` to select a team, or use `vercel link`.';
      return emitAlertsScopeError(client, jsonOutput, 'NO_TEAM', msg, {
        reason: AGENT_REASON.MISSING_SCOPE,
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
            when: 'See current user and team',
          },
          {
            command: buildCommandWithGlobalFlags(client.argv, 'teams switch'),
            when: 'Switch to a team that owns the project',
          },
        ],
      });
    }
    return { teamId: team.id };
  }

  if (flags['--project']) {
    const { team } = await getScope(client);
    if (!team) {
      const msg =
        'No team context found. Run `vercel switch` to select a team.';
      return emitAlertsScopeError(client, jsonOutput, 'NO_TEAM', msg, {
        reason: AGENT_REASON.MISSING_SCOPE,
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
            when: 'See current user and team',
          },
          {
            command: buildCommandWithGlobalFlags(client.argv, 'teams switch'),
            when: 'Switch to a team that owns the project',
          },
        ],
      });
    }
    try {
      const p = await getProjectByNameOrId(client, flags['--project'], team.id);
      if (p instanceof ProjectNotFound) {
        const msg = `Project "${flags['--project']}" was not found.`;
        return emitAlertsScopeError(
          client,
          jsonOutput,
          'PROJECT_NOT_FOUND',
          msg,
          {
            reason: AGENT_REASON.NOT_FOUND,
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'alerts inspect <groupId> --project <name_or_id>'
                ),
                when: 'Retry with a valid project (replace placeholders)',
              },
            ],
          }
        );
      }
      return { teamId: team.id, projectId: p.id };
    } catch (err) {
      if (isAPIError(err)) {
        const msg =
          err.serverMessage ||
          (err.status === 403
            ? `You do not have permission to access project "${flags['--project']}" in team "${team.slug}".`
            : `API error (${err.status}).`);
        const reason =
          err.status === 401
            ? 'not_authorized'
            : err.status === 403
              ? 'forbidden'
              : AGENT_REASON.API_ERROR;
        return emitAlertsScopeError(
          client,
          jsonOutput,
          err.code || 'API_ERROR',
          msg,
          {
            reason,
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'alerts inspect <groupId> --project <name_or_id>'
                ),
                when: 'Retry with a project you can access',
              },
            ],
          }
        );
      }
      throw err;
    }
  }

  const linked = await getLinkedProject(client);
  if (linked.status === 'error') {
    return linked.exitCode;
  }
  if (linked.status === 'not_linked') {
    const msg =
      'No linked project. Run `vercel link` or pass --project <name> or --all.';
    return emitAlertsScopeError(client, jsonOutput, 'NOT_LINKED', msg, {
      reason: AGENT_REASON.NOT_LINKED,
      next: [
        {
          command: buildCommandWithGlobalFlags(client.argv, 'link'),
          when: 'Link this directory to a Vercel project',
        },
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'alerts inspect <groupId> --project <name_or_id>'
          ),
          when: 'Inspect using an explicit project',
        },
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'alerts inspect <groupId> --all'
          ),
          when: 'Inspect using team-wide scope',
        },
      ],
    });
  }
  return {
    teamId: linked.org.id,
    projectId: linked.project.id,
  };
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

  const scope = await resolveInspectScope(
    client,
    {
      '--project': parsedArgs.flags['--project'] as string | undefined,
      '--all': parsedArgs.flags['--all'] as boolean | undefined,
    },
    fr.jsonOutput
  );
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
