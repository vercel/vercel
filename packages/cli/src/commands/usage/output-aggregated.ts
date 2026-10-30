import chalk from 'chalk';
import table from '../../util/output/table';
import output from '../../output-manager';
import elapsed from '../../util/output/elapsed';
import { formatUsageAmount, formatUsageQuantity } from './format';
import type { OutputOptions, ServiceAggregation, UsageData } from './types';
import {
  formatServiceCost,
  formatServiceName,
  outputHiddenServicesHint,
  outputUsageHeader,
  visibleServices,
} from './output-utils';

export function outputAggregated({ data, startTime }: OutputOptions): void {
  const { print, log } = output;

  outputUsageHeader(data, 'Usage', elapsed(Date.now() - startTime));

  if (data.creditBalance) {
    log(chalk.bold('Current credit balance'));
    if (data.creditBalance.cadence) {
      log(
        `  ${chalk.gray('Cadence')}    ${formatCadence(data.creditBalance.cadence)}`
      );
    }
    log(
      `  ${chalk.gray('Used')}       ${formatCredit(data.creditBalance.used, data.creditBalance.currency)} of ${formatCredit(data.creditBalance.allocated, data.creditBalance.currency)}`
    );
    log(
      `  ${chalk.gray('Remaining')}  ${formatCredit(data.creditBalance.remaining, data.creditBalance.currency)}`
    );
    const progress =
      data.creditBalance.allocated > 0
        ? (data.creditBalance.used / data.creditBalance.allocated) * 100
        : 0;
    log(`  ${chalk.gray('Progress')}   ${Math.round(progress)}%`);
    log('');
  }

  const allServices = [...data.services.entries()];
  const sortedServices = visibleServices(data.services).sort(
    (a, b) => b[1].cost - a[1].cost
  );

  if (sortedServices.length === 0) {
    log('No usage data found for this period.');
    outputHiddenServicesHint(allServices.length);
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
    printTable(print, usage, 'Infrastructure subtotal', data.costUnit);
    log('');
  }

  if (subscriptions.length > 0) {
    log(chalk.bold('Subscription licenses'));
    printTable(print, subscriptions, 'Subscriptions subtotal', data.costUnit);
    log('');
  }

  printCostSummary(print, usage, subscriptions, data.costUnit);
  outputHiddenServicesHint(allServices.length - sortedServices.length);
}

function formatCadence(
  cadence: NonNullable<NonNullable<UsageData['creditBalance']>['cadence']>
): string {
  return cadence
    .split('_')
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function formatCredit(amount: number, currency: string): string {
  return formatUsageAmount(amount, currency);
}

function printCostSummary(
  print: (message: string) => void,
  usage: [string, ServiceAggregation][],
  subscriptions: [string, ServiceAggregation][],
  costUnit: UsageData['costUnit']
): void {
  const subscriptionCost = sumCost(subscriptions);
  const infrastructureCost = sumCost(usage);
  const rows = [
    ['Subscriptions', formatUsageAmount(subscriptionCost, costUnit)],
    ['Infrastructure usage', formatUsageAmount(infrastructureCost, costUnit)],
    [
      chalk.bold('Estimated total'),
      chalk.bold(
        formatUsageAmount(subscriptionCost + infrastructureCost, costUnit)
      ),
    ],
  ];

  const tablePrint = table(rows, { hsep: 4, align: ['l', 'r'] }).replace(
    /^/gm,
    '  '
  );
  print(`${tablePrint}\n`);
}

function sumCost(services: [string, ServiceAggregation][]): number {
  return services.reduce((total, [, service]) => total + service.cost, 0);
}

function printTable(
  print: (message: string) => void,
  services: [string, ServiceAggregation][],
  subtotalLabel: string,
  costUnit: UsageData['costUnit']
): void {
  const headers = ['Service', 'Usage', 'Cost'];
  const rows = services.map(([name, service]) => {
    return [
      formatServiceName(name, service),
      formatUsageQuantity(service.quantity, service.unit, {
        compact: true,
        showSmallValues: service.category === 'usage',
        singularUnit: service.singularUnit,
        unitKind: service.unitKind,
      }),
      formatServiceCost(service, costUnit),
    ];
  });
  const subtotal = services.reduce(
    (total, [, service]) => total + service.cost,
    0
  );
  rows.push([
    chalk.bold(subtotalLabel),
    '',
    chalk.bold(formatUsageAmount(subtotal, costUnit)),
  ]);

  const tablePrint = table(
    [headers.map(header => chalk.bold(chalk.cyan(header))), ...rows],
    { hsep: 4, align: ['l', 'l', 'r'] }
  ).replace(/^/gm, '  ');

  print(`\n${tablePrint}\n`);
}
