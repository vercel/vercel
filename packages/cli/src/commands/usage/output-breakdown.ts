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
    default:
      return 'Period';
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
  const periodSuffix = data.usingDefaults ? ' (current month)' : '';
  log(
    `${chalk.gray('Period:')} ${data.fromDisplay} to ${data.toDisplay}${periodSuffix}`
  );
  log(`${chalk.gray('Charges processed:')} ${data.chargeCount}`);
  log(`${chalk.gray('Pricing unit:')} ${data.pricingUnit}`);
  log('');

  const sortedServices = [...data.services.entries()].sort(
    (a, b) => b[1].billedCost - a[1].billedCost
  );

  if (sortedServices.length === 0) {
    log('No usage data found for this period.');
    return;
  }

  const quantityHeader =
    data.pricingUnit === 'USD' ? 'Usage (USD)' : data.pricingUnit;

  // Sort periods chronologically
  const sortedPeriods = [...data.periodUsage.keys()].sort();

  for (const periodKey of sortedPeriods) {
    const periodData = data.periodUsage.get(periodKey)!;
    const sortedPeriodServices = [...periodData.services.entries()].sort(
      (a, b) => b[1].billedCost - a[1].billedCost
    );

    log(
      `${chalk.bold(chalk.cyan(periodKey))} (Total: ${formatQuantity(periodData.totalPricingQuantity, data.pricingUnit)}, ${formatCurrency(periodData.totalBilledCost)})`
    );

    const headers = ['Service', quantityHeader, 'Billed Cost'];
    const rows = sortedPeriodServices.map(([name, svc]) => [
      name,
      formatQuantity(svc.pricingQuantity, svc.pricingUnit),
      formatCurrency(svc.billedCost),
    ]);

    const tablePrint = table(
      [headers.map(h => chalk.bold(chalk.gray(h))), ...rows],
      { hsep: 4, align: ['l', 'r', 'r'] }
    ).replace(/^/gm, '  ');

    print(`${tablePrint}\n`);
  }
}
