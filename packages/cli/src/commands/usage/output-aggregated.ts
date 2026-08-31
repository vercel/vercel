import chalk from 'chalk';
import table from '../../util/output/table';
import output from '../../output-manager';
import elapsed from '../../util/output/elapsed';
import { formatCurrency, formatQuantity } from '../../util/billing/format';
import type { OutputOptions, ServiceAggregation } from './types';

export function outputAggregated({ data, startTime }: OutputOptions): void {
  const { print, log } = output;

  log(
    `Usage for ${chalk.bold(data.contextName)} ${elapsed(Date.now() - startTime)}`
  );
  log('');
  const periodSuffix = data.usingDefaults ? ' (current billing cycle)' : '';
  log(
    `${chalk.gray('Period:')} ${data.fromDisplay} to ${data.toDisplay}${periodSuffix}`
  );
  log('');

  const sortedServices = [...data.services.entries()].sort(
    (a, b) => b[1].cost - a[1].cost
  );

  if (sortedServices.length === 0) {
    log('No usage data found for this period.');
    return;
  }

  const usage = sortedServices.filter(
    ([, service]) => service.category === 'usage'
  );
  const subscriptions = sortedServices.filter(
    ([, service]) => service.category === 'subscription'
  );

  if (usage.length > 0) {
    log(chalk.bold('Infrastructure'));
    printTable(print, usage);
    log('');
  }

  if (subscriptions.length > 0) {
    log(chalk.bold('Subscription licenses'));
    printTable(print, subscriptions);
    log('');
  }

  log(
    `${chalk.gray('Estimated total:')} ${chalk.bold(formatCurrency(data.totalCost))}`
  );
}

function printTable(
  print: (message: string) => void,
  services: [string, ServiceAggregation][]
): void {
  const headers = ['Service', 'Usage', 'Cost'];
  const rows = services.map(([name, service]) => [
    service.included ? chalk.blue(name) : name,
    service.category === 'subscription'
      ? formatQuantity(service.quantity || 1, 'licenses')
      : formatQuantity(service.quantity, service.unit),
    service.included ? 'Included' : formatCurrency(service.cost),
  ]);

  const tablePrint = table(
    [headers.map(header => chalk.bold(chalk.cyan(header))), ...rows],
    { hsep: 4, align: ['l', 'r', 'r'] }
  ).replace(/^/gm, '  ');

  print(`\n${tablePrint}\n`);
}
