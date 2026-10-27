import chalk from 'chalk';
import output from '../../../output-manager';
import { buildCommandWithGlobalFlags } from '../../../util/agent-output';
import { quoteArg } from '../../../util/flags/quote-arg';
import { printAlignedLabel } from '../../../util/output/print-aligned-label';
import type {
  AlertRuleNotification,
  AlertRuleNotificationMutation,
  AlertRuleNotificationProjectScope,
  AlertRulesNotificationsResult,
} from '../types';

const CRITICAL_DELIVERY_DESCRIPTION =
  'Critical only (escalated by Vercel Agent)';

function formatMinimumSeverity(notification: AlertRuleNotification): string {
  const level = notification.minimumSeverityLevel;
  if (level === 'critical') return CRITICAL_DELIVERY_DESCRIPTION;
  if (level) return `${level[0].toUpperCase()}${level.slice(1)} and above`;
  if (notification.type === 'webhook' && !('url' in notification.webhook)) {
    return 'Details unavailable';
  }
  return 'Monitor setting';
}

function formatProjectScope(scope: AlertRuleNotificationProjectScope): string {
  return scope.type === 'all'
    ? 'all projects'
    : `${scope.projectName} (${scope.projectId})`;
}

function formatNotificationExpanded(
  notification: AlertRuleNotification,
  index: number
): string {
  if (notification.type === 'slack') {
    return [
      `    ${index + 1}. ${chalk.bold('Slack')} ${chalk.cyan(`#${notification.channelName}`)}`,
      `       ${chalk.dim('Project scope:')} ${formatProjectScope(notification.projectScope)}`,
      `       ${chalk.dim('Channel ID:')} ${notification.channelId}`,
      `       ${chalk.dim('Slack installation ID:')} ${notification.configId}`,
      `       ${chalk.dim('Minimum severity:')} ${formatMinimumSeverity(notification)}`,
    ].join('\n');
  }

  const { webhook } = notification;
  return [
    `    ${index + 1}. ${chalk.bold('Webhook')}`,
    `       ${chalk.dim('Webhook ID:')} ${webhook.id}`,
    `       ${chalk.dim('URL:')} ${'url' in webhook ? webhook.url : 'Details unavailable'}`,
    `       ${chalk.dim('Minimum severity:')} ${formatMinimumSeverity(notification)}`,
  ].join('\n');
}

function formatRuleExpanded(
  ruleId: string,
  notifications: AlertRuleNotification[]
): string {
  const lines = [`  ${chalk.bold(ruleId)}`];
  if (notifications.length === 0) {
    lines.push(`    ${chalk.dim('No notification destinations')}`);
  } else {
    lines.push(
      notifications
        .map((notification, index) =>
          formatNotificationExpanded(notification, index)
        )
        .join('\n\n')
    );
  }
  return lines.join('\n');
}

export function printRuleNotifications(
  ruleId: string,
  notifications: AlertRuleNotification[]
): void {
  if (notifications.length === 0) {
    output.log(`No notification destinations are linked to monitor ${ruleId}.`);
    return;
  }

  output.print(
    `\n${chalk.bold('Notification destinations')} for ${chalk.cyan(ruleId)}\n\n${notifications.map(formatNotificationExpanded).join('\n\n')}\n`
  );
}

export function printRulesNotifications(
  result: AlertRulesNotificationsResult
): void {
  const ruleEntries = Object.entries(result.notifications).filter(
    ([, notifications]) => notifications.length > 0
  );
  const rendered =
    ruleEntries.length > 0
      ? `\n${chalk.bold('Monitor notification destinations')}\n\n${ruleEntries
          .map(([ruleId, notifications]) =>
            formatRuleExpanded(ruleId, notifications)
          )
          .join('\n\n')}\n`
      : '\nNo linked notification destinations found.\n';

  output.print(rendered);
}

function formatTarget(target: AlertRuleNotificationMutation): string {
  if (target.type === 'webhook') return `webhook ${target.webhookId}`;
  return `Slack channel ${target.channelId}${
    target.configId ? ` (installation ${target.configId})` : ''
  }`;
}

export function buildRuleNotificationsInspectCommand(
  argv: string[],
  ruleId: string
): string {
  return buildCommandWithGlobalFlags(
    argv,
    `monitors notifications ${quoteArg(ruleId)}`
  );
}

export function printRuleNotificationMutationReceipt(
  action: 'Linked' | 'Updated' | 'Unlinked',
  ruleId: string,
  target: AlertRuleNotificationMutation,
  argv: string[]
): void {
  const inspectCommand = buildRuleNotificationsInspectCommand(argv, ruleId);
  output.print('\n');
  printAlignedLabel(action, formatTarget(target), { gutter: '✓' });
  printAlignedLabel('Monitor', chalk.cyan(ruleId));
  if (target.minimumSeverityLevel === 'critical') {
    printAlignedLabel('Delivery', CRITICAL_DELIVERY_DESCRIPTION);
  } else if (target.minimumSeverityLevel === null) {
    printAlignedLabel('Delivery', 'Every alert matched by the monitor');
  }
  printAlignedLabel('Inspect', chalk.dim(inspectCommand));
}
