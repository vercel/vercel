import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import { validateJsonOutput } from '../../../util/output-format';
import { isAPIError } from '../../../util/errors-ts';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { packageName } from '../../../util/pkg-name';
import { rulesInspectSubcommand } from './command';
import { parseRulesFlagsAndScope } from './parse-scope';
import formatDate from '../../../util/format-date';
import {
  emitRulesArgParseError,
  handleRulesApiError,
  rulesItemPath,
} from './util';
import chalk from 'chalk';
import { formatGranularity } from '../../../util/output/format-granularity';
import {
  formatCustomAlertMetric,
  formatCustomAlertTrigger,
  formatRuleScope,
  humanizeReference,
  isCustomAlertRule,
  parseCustomAlertQuery,
  renderAlertTable,
} from '../format';
import { truncateMiddle } from '../../../util/output/truncate';
import type { AlertRule, CustomAlertDefinition } from '../types';

function formatBoolean(value: boolean | undefined): string {
  if (value === undefined) {
    return '-';
  }

  return value ? 'yes' : 'no';
}

function getAlertTypeRows(rule: AlertRule): string[][] {
  const types =
    rule.alertTypes?.map(alertType => alertType.type) ??
    (rule.customAlert ? ['custom_alert'] : []);

  if (types.length === 0) {
    return [];
  }

  const uniqueTypes = [...new Set(types)];
  return [
    [
      uniqueTypes.length === 1 ? 'Type' : 'Types',
      uniqueTypes.map(value => humanizeReference(value)).join(', '),
    ],
  ];
}

function getNotificationRows(rule: AlertRule): string[][] {
  const rows: string[][] = [];

  if (rule.autosubscribeOwnersInKnock !== undefined) {
    rows.push([
      'Auto-subscribe owners',
      formatBoolean(rule.autosubscribeOwnersInKnock),
    ]);
  }
  if (rule.autosubscribeProjectAdminsInKnock !== undefined) {
    rows.push([
      'Auto-subscribe project admins',
      formatBoolean(rule.autosubscribeProjectAdminsInKnock),
    ]);
  }

  const slackChannels = new Set<string>();
  const webhooks = new Set<string>();
  for (const notification of rule.notifications ?? []) {
    for (const channel of notification.slack ?? []) {
      slackChannels.add(channel);
    }
    for (const webhook of notification.webhooks ?? []) {
      webhooks.add(webhook);
    }
  }

  if (slackChannels.size > 0) {
    rows.push(['Slack', [...slackChannels].join(', ')]);
  }
  if (webhooks.size > 0) {
    rows.push(['Webhooks', [...webhooks].join(', ')]);
  }

  return rows;
}

function getCustomAlertRows(customAlert: CustomAlertDefinition): string[][] {
  const query = parseCustomAlertQuery(customAlert.queryJsonString);
  const granularity = formatGranularity(query.granularity);
  const groupBy = query.groupBy ?? [];
  const rows = [
    ['Title', customAlert.title || '-'],
    ['Metric', formatCustomAlertMetric(customAlert) || '-'],
    ['Trigger', formatCustomAlertTrigger(customAlert) || '-'],
    ...(typeof customAlert.minThreshold === 'number'
      ? [['Minimum', String(customAlert.minThreshold)]]
      : []),
    ...(query.event ? [['Event', humanizeReference(query.event)]] : []),
    ...(groupBy.length > 0
      ? [
          [
            'Group By',
            groupBy.map(value => humanizeReference(value)).join(', '),
          ],
        ]
      : []),
    ...(granularity ? [['Granularity', granularity]] : []),
    ...(customAlert.createdAt
      ? [['Created At', formatDate(customAlert.createdAt)]]
      : []),
  ];

  return rows.map(([label, value]) => [label, truncateMiddle(value, 96)]);
}

function printRule(rule: AlertRule, ruleId: string) {
  const summaryRows = [
    ['Name', rule.name || '-'],
    ...(rule.action === 'exclude' ? [['Action', rule.action]] : []),
    ['Scope', formatRuleScope(rule.projectId)],
    ...getAlertTypeRows(rule),
    ...(rule.sensitivityLevel !== undefined
      ? [['Sensitivity', String(rule.sensitivityLevel)]]
      : []),
    ...(rule.isDefault !== undefined
      ? [['Default', formatBoolean(rule.isDefault)]]
      : []),
    ...(rule.owner ? [['Owner', rule.owner]] : []),
    ...(rule.teamId ? [['Team id', rule.teamId]] : []),
    ...(rule.lastEditedByUserId
      ? [['Last Edited By', rule.lastEditedByUserId]]
      : []),
    ...(rule.odataFilters ? [['OData Filters', rule.odataFilters]] : []),
  ];
  const sections = [
    '',
    `${chalk.bold('Alert rule')} ${chalk.cyan(rule.id || ruleId)}`,
    renderAlertTable(summaryRows, 3),
  ];

  const notificationRows = getNotificationRows(rule);
  if (notificationRows.length > 0) {
    sections.push(
      '',
      chalk.cyan('Notifications'),
      renderAlertTable(notificationRows, 3)
    );
  }

  if (rule.customAlert) {
    sections.push(
      '',
      chalk.cyan('Custom Alert'),
      renderAlertTable(getCustomAlertRows(rule.customAlert), 3)
    );
  } else if (isCustomAlertRule(rule)) {
    sections.push(
      '',
      chalk.cyan('Custom Alert'),
      '  No custom alert definition returned.'
    );
  }

  output.print(`${sections.join('\n')}\n`);
}

export default async function ruleInspect(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(rulesInspectSubcommand.options)
    );
  } catch (e) {
    emitRulesArgParseError(
      client,
      e,
      'alerts rules inspect <ruleId> --project <name-or-id>'
    );
    printError(e);
    return 1;
  }

  const ruleId = parsedArgs.args[0];
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

  if (!ruleId) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: `Missing rule id. Example: ${packageName} alerts rules inspect <ruleId>`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'alerts rules inspect <ruleId>'
            ),
            when: 'Replace <ruleId> with an id from `alerts rules ls`',
          },
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'alerts rules ls'
            ),
            when: 'List rule ids in the current scope',
          },
        ],
      },
      1
    );
    output.error('Usage: `vercel alerts rules inspect <ruleId>`');
    return 1;
  }

  const scope = await parseRulesFlagsAndScope(
    client,
    {
      '--project': parsedArgs.flags['--project'] as string | undefined,
      '--all': parsedArgs.flags['--all'] as boolean | undefined,
    },
    fr.jsonOutput,
    `alerts rules inspect ${ruleId}`
  );
  if (typeof scope === 'number') {
    return scope;
  }

  const path = rulesItemPath(scope, ruleId);
  output.spinner('Fetching alert rule...');
  try {
    const rule = await client.fetch<AlertRule>(path);
    output.stopSpinner();
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify({ rule }, null, 2)}\n`);
    } else {
      printRule(rule, ruleId);
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      return handleRulesApiError(client, err, fr.jsonOutput);
    }
    throw err;
  } finally {
    output.stopSpinner();
  }
}
