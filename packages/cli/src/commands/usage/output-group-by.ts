import chalk from 'chalk';
import table from '../../util/output/table';
import output from '../../output-manager';
import elapsed from '../../util/output/elapsed';
import { formatCurrency, formatQuantity } from '../../util/billing/format';
import type { OutputOptions, GroupByDimension } from './types';

function getDimensionLabel(dimension: GroupByDimension): string {
  switch (dimension) {
    case 'project':
      return 'Project';
    case 'region':
      return 'Region';
    default:
      return 'Group';
  }
}

export function outputGroupBy({
  data,
  groupByDimension,
  startTime,
}: OutputOptions): void {
  const { print, log } = output;
  const dimensionLabel = getDimensionLabel(groupByDimension!);

  log(
    `Usage by ${dimensionLabel} for ${chalk.bold(data.contextName)} ${elapsed(Date.now() - startTime)}`
  );
  log('');
  const periodSuffix = data.usingDefaults ? ' (current month)' : '';
  log(
    `${chalk.gray('Period:')} ${data.fromDisplay} to ${data.toDisplay}${periodSuffix}`
  );
  log(`${chalk.gray('Charges processed:')} ${data.chargeCount}`);
  log(`${chalk.gray('Pricing unit:')} ${data.pricingUnit}`);
  log('');

  const sortedGroups = [...data.groupByUsage.entries()].sort(
    (a, b) => b[1].totalBilledCost - a[1].totalBilledCost
  );

  if (sortedGroups.length === 0) {
    log('No usage data found for this period.');
    return;
  }

  const quantityHeader =
    data.pricingUnit === 'USD' ? 'Usage (USD)' : data.pricingUnit;

  for (const [groupName, groupData] of sortedGroups) {
    log(
      `${chalk.bold(chalk.cyan(groupName))} (Total: ${formatQuantity(groupData.totalPricingQuantity, data.pricingUnit)}, ${formatCurrency(groupData.totalBilledCost)})`
    );

    const sortedServices = [...groupData.services.entries()].sort(
      (a, b) => b[1].billedCost - a[1].billedCost
    );

    const headers = ['Service', quantityHeader, 'Billed Cost'];
    const rows = sortedServices.map(([name, svc]) => [
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

  log('');
  log(
    `${chalk.gray('Amount due:')} ${chalk.bold(formatCurrency(data.grandTotals.billedCost))}`
  );
}
