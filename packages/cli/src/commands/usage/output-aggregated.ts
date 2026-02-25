import chalk from 'chalk';
import table from '../../util/output/table';
import output from '../../output-manager';
import elapsed from '../../util/output/elapsed';
import { formatCurrency, formatQuantity } from '../../util/billing/format';
import type { OutputOptions } from './types';

export function outputAggregated({ data, startTime }: OutputOptions): void {
  const { print, log } = output;

  log(
    `Usage for ${chalk.bold(data.contextName)} ${elapsed(Date.now() - startTime)}`
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
  const headers = ['Service', quantityHeader, 'Effective Cost', 'Billed Cost'];
  const rows = sortedServices.map(([name, svc]) => [
    name,
    formatQuantity(svc.pricingQuantity, svc.pricingUnit),
    formatCurrency(svc.effectiveCost),
    formatCurrency(svc.billedCost),
  ]);

  rows.push([
    chalk.bold('Total'),
    chalk.bold(
      formatQuantity(data.grandTotals.pricingQuantity, data.pricingUnit)
    ),
    chalk.bold(formatCurrency(data.grandTotals.effectiveCost)),
    chalk.bold(formatCurrency(data.grandTotals.billedCost)),
  ]);

  const tablePrint = table(
    [headers.map(h => chalk.bold(chalk.cyan(h))), ...rows],
    { hsep: 4, align: ['l', 'r', 'r', 'r'] }
  ).replace(/^/gm, '  ');

  print(`\n${tablePrint}\n\n`);

  log(
    `${chalk.gray('Amount due:')} ${chalk.bold(formatCurrency(data.grandTotals.billedCost))}`
  );
}
