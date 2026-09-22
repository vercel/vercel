import chalk from 'chalk';
import output from '../../../output-manager';
import { buildCommandWithGlobalFlags } from '../../../util/agent-output';
import { quoteArg } from '../../../util/flags/quote-arg';
import formatDate from '../../../util/format-date';
import { printAlignedLabel } from '../../../util/output/print-aligned-label';
import { truncateEnd, truncateMiddle } from '../../../util/output/truncate';
import { humanizeReference, renderAlertTable } from '../format';
import type {
  BuiltInAlertRule,
  CustomAlertMetric,
  CustomAlertRule,
  CustomAlertTrigger,
  PublicAlertRule,
  SupportedCustomAlertRule,
} from './types';

function formatBoolean(value: boolean): string {
  return value ? 'yes' : 'no';
}

function formatOperator(operator: string): string {
  return (
    {
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
    }[operator] ?? operator
  );
}

export function formatPublicRuleScope(rule: PublicAlertRule): string {
  const scope = rule.ruleScope;
  if (scope.type === 'all') return 'all projects';
  if (scope.type === 'project') return `project: ${scope.projectId}`;
  return `${scope.type}: ${scope.projectIds.join(', ')}`;
}

function formatMetricSelection(metric: CustomAlertMetric): string {
  const modifiers = [
    metric.per ? `per ${metric.per}` : undefined,
    metric.normalize ? `normalize ${metric.normalize}` : undefined,
    metric.dimensions?.length
      ? `dimensions ${metric.dimensions.join(', ')}`
      : undefined,
  ].filter(Boolean);
  return `${metric.aggregation} ${metric.metric}${
    modifiers.length ? ` (${modifiers.join('; ')})` : ''
  }`;
}

function formatCustomTrigger(trigger: CustomAlertTrigger): string {
  const minimum = trigger.minimum
    ? `; minimum ${trigger.minimum.output} >= ${trigger.minimum.threshold}`
    : '';
  if (trigger.type === 'anomaly') {
    return `${trigger.output} anomaly at ${trigger.standardDeviations} standard deviations${minimum}`;
  }
  return `${trigger.output} ${formatOperator(trigger.operator)} ${trigger.threshold}${minimum}`;
}

function formatCustomCondition(rule: CustomAlertRule): string {
  if (!rule.querySupported) return 'Query unavailable via API';
  const query = rule.evaluation.query;
  const output = query.outputs[0];
  const selection = query.formulas?.[output]
    ? `${output} = ${query.formulas[output]}`
    : query.metrics[output]
      ? formatMetricSelection(query.metrics[output])
      : output;
  return `${selection}; ${formatCustomTrigger(rule.trigger)}; ${rule.evaluation.window}`;
}

function formatBuiltInCondition(rule: BuiltInAlertRule): string {
  const triggers =
    rule.triggers.mode === 'all'
      ? 'all triggers'
      : rule.triggers.items
          .map(trigger => humanizeReference(trigger.type))
          .join(', ');
  return `${triggers}; minimum ${rule.matchMinimumSeverityLevel}`;
}

function formatRuleCondition(rule: PublicAlertRule): string {
  return rule.type === 'built-in'
    ? formatBuiltInCondition(rule)
    : formatCustomCondition(rule);
}

export function printRules(rules: PublicAlertRule[]): void {
  const rows = [
    ['Name', 'Rule ID', 'Type', 'Scope', 'Condition'].map(header =>
      chalk.cyan(header)
    ),
    ...rules.map(rule => [
      chalk.bold(truncateEnd(rule.name, 36)),
      chalk.dim(rule.id),
      rule.isDefault ? `${rule.type} (default)` : rule.type,
      truncateMiddle(formatPublicRuleScope(rule), 38),
      truncateEnd(formatRuleCondition(rule), 72),
    ]),
  ];
  output.print(`\n${renderAlertTable(rows, 2)}\n`);
}

function commonRows(rule: PublicAlertRule): string[][] {
  return [
    ['Name', rule.name],
    ['Rule ID', rule.id],
    ['Type', rule.type],
    ['Scope', formatPublicRuleScope(rule)],
    ['Default', formatBoolean(rule.isDefault)],
    ...(rule.createdAt ? [['Created', formatDate(rule.createdAt)]] : []),
    ...(rule.updatedAt ? [['Updated', formatDate(rule.updatedAt)]] : []),
  ];
}

function notificationRows(rule: PublicAlertRule): string[][] {
  return [
    [
      'Team owner notifications',
      formatBoolean(rule.notificationSettings.enableTeamOwnerNotifications),
    ],
    ...(rule.notificationSettings.incidentIoRoutingKey
      ? [
          [
            'Incident.io routing key',
            rule.notificationSettings.incidentIoRoutingKey,
          ],
        ]
      : []),
  ];
}

function printBuiltInRule(rule: BuiltInAlertRule): void {
  output.print(`${chalk.cyan('Built-in conditions')}\n\n`);
  if (rule.triggers.mode === 'all') {
    output.print(
      `${renderAlertTable(
        [
          ['Minimum severity', rule.matchMinimumSeverityLevel],
          ['Triggers', 'all built-in triggers'],
        ],
        3
      )}\n`
    );
  } else {
    output.print(
      `${renderAlertTable(
        [['Minimum severity', rule.matchMinimumSeverityLevel]],
        3
      )}\n\n${renderAlertTable(
        [
          ['Trigger', 'Filter'].map(header => chalk.cyan(header)),
          ...rule.triggers.items.map(trigger => [
            trigger.type,
            trigger.filter || '-',
          ]),
        ],
        3
      )}\n`
    );
  }
}

function metricRows(rule: SupportedCustomAlertRule): string[][] {
  return Object.entries(rule.evaluation.query.metrics).map(
    ([alias, metric]) => [
      alias,
      metric.metric,
      metric.aggregation,
      [
        metric.per ? `per ${metric.per}` : undefined,
        metric.normalize ? `normalize ${metric.normalize}` : undefined,
        metric.dimensions?.join(', '),
      ]
        .filter(Boolean)
        .join('; ') || '-',
      metric.filter || '-',
    ]
  );
}

function printCustomRule(rule: CustomAlertRule): void {
  output.print(`${chalk.cyan('Custom alert')}\n\n`);
  if (!rule.querySupported) {
    output.print(
      '  Query unavailable via API. You can update metadata, delete the rule, or recreate it with a supported query.\n'
    );
    output.print(`\n${renderAlertTable([['Severity', rule.severity]], 3)}\n`);
    return;
  }

  const query = rule.evaluation.query;
  output.print(
    `${renderAlertTable(
      [
        ['Severity', rule.severity],
        ['Window', rule.evaluation.window],
        ['Output', query.outputs[0]],
        ...(query.formulas
          ? Object.entries(query.formulas).map(([alias, formula]) => [
              `Formula ${alias}`,
              formula,
            ])
          : []),
        ...(query.groupBy?.length
          ? [['Group By', query.groupBy.join(', ')]]
          : []),
        ...(query.filter ? [['Query Filter', query.filter]] : []),
      ],
      3
    )}\n`
  );
  output.print(`\n${chalk.cyan('Metrics')}\n\n`);
  output.print(
    `${renderAlertTable(
      [
        ['Alias', 'Metric', 'Aggregation', 'Modifiers', 'Filter'].map(header =>
          chalk.cyan(header)
        ),
        ...metricRows(rule),
      ],
      3
    )}\n`
  );
  output.print(`\n${chalk.cyan('Trigger')}\n\n`);
  output.print(
    `${renderAlertTable(
      [
        ['Type', rule.trigger.type],
        ['Output', rule.trigger.output],
        ...(rule.trigger.type === 'threshold'
          ? [
              ['Operator', rule.trigger.operator],
              ['Threshold', String(rule.trigger.threshold)],
            ]
          : [['Standard Deviations', String(rule.trigger.standardDeviations)]]),
        ...(rule.trigger.minimum
          ? [
              ['Minimum Output', rule.trigger.minimum.output],
              ['Minimum Threshold', String(rule.trigger.minimum.threshold)],
            ]
          : []),
      ],
      3
    )}\n`
  );
}

export function printRule(rule: PublicAlertRule): void {
  output.print(
    `\n${chalk.bold('Alert rule')} ${chalk.cyan(rule.id)}\n${renderAlertTable(
      commonRows(rule),
      3
    )}\n\n${chalk.cyan('Notifications')}\n\n${renderAlertTable(
      notificationRows(rule),
      3
    )}\n\n`
  );
  if (rule.type === 'built-in') printBuiltInRule(rule);
  else printCustomRule(rule);
}

export function printRulePreview(rule: PublicAlertRule): void {
  printAlignedLabel('Name', rule.name);
  printAlignedLabel('Rule ID', rule.id);
  printAlignedLabel('Type', rule.type);
  printAlignedLabel('Scope', formatPublicRuleScope(rule));
}

export function printRuleDeletionReceipt(ruleId: string): void {
  output.print('\n');
  printAlignedLabel('Deleted', ruleId, { gutter: '✓' });
}

export function printRuleMutationReceipt(
  action: 'Created' | 'Updated' | 'Unchanged' | 'Deleted',
  rule: PublicAlertRule,
  argv: string[]
): void {
  output.print('\n');
  printAlignedLabel(action, rule.name, { gutter: '✓' });
  printAlignedLabel('Rule ID', rule.id);
  printAlignedLabel('Type', rule.type);
  printAlignedLabel('Scope', formatPublicRuleScope(rule));
  if (action !== 'Deleted') {
    printAlignedLabel(
      'Inspect',
      buildCommandWithGlobalFlags(
        argv,
        `alerts rules inspect ${quoteArg(rule.id)}`
      )
    );
  }
}
