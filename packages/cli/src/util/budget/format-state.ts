import chalk from 'chalk';
import table from '../output/table';
import output from '../../output-manager';
import {
  formatUsd,
  formatUsdWhole,
  percentUsed,
  type BudgetAlert,
  type BudgetState,
} from './api';

export function webhookLabel(
  state: Pick<BudgetState, 'webhookUrl' | 'webhookStatus'>
): string {
  if (state.webhookStatus === 'unavailable') {
    return 'configured (unavailable)';
  }
  return state.webhookUrl ?? '—';
}

/**
 * Same table `ls`, `set`, and inspect use. Each budget scope has its own
 * spend, so `spentFor` returns one row's spend in dollars, or `null` when it
 * couldn't be loaded. Without `spentFor` the table has no spend columns.
 */
export function printBudgetsTable(
  states: BudgetState[],
  spentFor?: (state: BudgetState) => number | null
): string {
  const spendHeaders = spentFor ? ['spent', 'used'] : [];
  const spendAlign: ('l' | 'r')[] = spentFor ? ['r', 'r'] : [];
  return `${table(
    [
      ['scope', 'amount', ...spendHeaders, 'status', 'pause', 'webhook'].map(
        header => chalk.gray(header)
      ),
      ...states.map(state => {
        const spendCells: string[] = [];
        if (spentFor) {
          const spent = spentFor(state);
          const used = percentUsed(spent, state.amount);
          spendCells.push(
            spent === null ? '—' : formatUsd(spent),
            used === null ? '—' : `${used}%`
          );
        }
        return [
          state.scopeId ? `${state.scope} ${state.scopeId}` : state.scope,
          formatUsdWhole(state.amount),
          ...spendCells,
          state.status,
          state.pause ? 'yes' : 'no',
          webhookLabel(state),
        ];
      }),
    ],
    { align: ['l', 'r', ...spendAlign, 'l', 'l', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}

export function warnUnavailableWebhooks(states: BudgetState[]) {
  if (states.some(state => state.webhookStatus === 'unavailable')) {
    output.warn(
      'A webhook is configured, but its URL could not be loaded. That is not the same as having no webhook.'
    );
  }
}

/** `2026-10-14 18:05 UTC`, so alert history reads the same on every machine. */
export function formatAlertTime(ms: number): string {
  if (!Number.isFinite(ms)) {
    return '—';
  }
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** API amounts are USD decimal strings; print them as-is if they do not parse. */
function formatUsdString(value: string, { whole }: { whole: boolean }): string {
  const dollars = Number(value);
  if (!Number.isFinite(dollars)) {
    return value;
  }
  return whole && Number.isInteger(dollars)
    ? formatUsdWhole(dollars)
    : formatUsd(dollars);
}

export function alertThresholdLabel(
  alert: Pick<BudgetAlert, 'threshold'>
): string {
  return `${alert.threshold.percent}%`;
}

export function alertActionsLabel(
  alert: Pick<BudgetAlert, 'threshold'>
): string {
  const { sendNotifications, triggerWebhook, pauseUsage } = alert.threshold;
  const actions = [
    sendNotifications && 'notify',
    triggerWebhook && 'webhook',
    pauseUsage && 'pause',
  ].filter(Boolean);
  return actions.length > 0 ? actions.join(', ') : '—';
}

/** Shared by `budgets alerts` and the recent-alerts tail in inspect. */
export function printBudgetAlertsTable(alerts: BudgetAlert[]): string {
  return `${table(
    [
      [
        'date',
        'budget',
        'threshold',
        'spent',
        'budget amount',
        'actions configured',
      ].map(header => chalk.gray(header)),
      ...alerts.map(alert => [
        formatAlertTime(alert.triggeredAt),
        alert.scope,
        alertThresholdLabel(alert),
        formatUsdString(alert.spent, { whole: false }),
        formatUsdString(alert.budgetAmount, { whole: true }),
        alertActionsLabel(alert),
      ]),
    ],
    { align: ['l', 'l', 'r', 'r', 'r', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
