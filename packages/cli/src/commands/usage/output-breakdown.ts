import chalk from 'chalk';
import table from '../../util/output/table';
import output from '../../output-manager';
import elapsed from '../../util/output/elapsed';
import { formatCurrency, formatQuantity } from '../../util/billing/format';
import type { OutputOptions, BreakdownPeriod } from './types';

function getPeriodLabel(period: BreakdownPeriod): string {
  switch (period) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
  }
}

export function outputBreakdown({
  data,
  breakdownPeriod,
  startTime,
}: OutputOptions): void {
  const { print, log } = output;
  const periodLabel = getPeriodLabel(breakdownPeriod!);

  log(
    `${periodLabel} Usage for ${chalk.bold(data.contextName)} ${elapsed(Date.now() - startTime)}`
  );
  log('');
  const periodSuffix = data.usingDefaults ? ' (current billing cycle)' : '';
  log(
    `${chalk.gray('Period:')} ${data.fromDisplay} to ${data.toDisplay}${periodSuffix}`
  );
  log('');

  const sortedPeriods = [...data.periodUsage.keys()].sort();
  if (sortedPeriods.length === 0) {
    log('No usage data found for this period.');
    return;
  }

  for (const periodKey of sortedPeriods) {
    const periodData = data.periodUsage.get(periodKey)!;
    const sortedServices = [...periodData.services.entries()].sort(
      (a, b) => b[1].cost - a[1].cost
    );
    log(
      `${chalk.bold(chalk.cyan(periodKey))} (${formatCurrency(periodData.totalCost)})`
    );

    const rows = sortedServices.map(([name, service]) => [
      service.included ? chalk.blue(name) : name,
      formatQuantity(service.quantity, service.unit),
      service.included ? 'Included' : formatCurrency(service.cost),
    ]);
    const tablePrint = table(
      [
        ['Service', 'Usage', 'Cost'].map(header =>
          chalk.bold(chalk.gray(header))
        ),
        ...rows,
      ],
      { hsep: 4, align: ['l', 'r', 'r'] }
    ).replace(/^/gm, '  ');
    print(`${tablePrint}\n`);
  }
}
