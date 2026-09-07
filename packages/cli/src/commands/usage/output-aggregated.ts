import chalk from 'chalk';
import table from '../../util/output/table';
import output from '../../output-manager';
import elapsed from '../../util/output/elapsed';
import { formatCurrency, formatQuantity } from '../../util/billing/format';
import type { OutputOptions, ServiceAggregation, UsageData } from './types';
import {
  outputHiddenServicesHint,
  outputUsageHeader,
  visibleServices,
} from './output-utils';

export function outputAggregated({ data, startTime }: OutputOptions): void {
  const { print, log } = output;

  outputUsageHeader(data, 'Usage', elapsed(Date.now() - startTime));

  if (data.credit) {
    log(chalk.bold('Credit'));
    if (data.credit.cadence) {
      log(
        `  ${chalk.gray('Cadence')}    ${formatCadence(data.credit.cadence)}`
      );
    }
    log(
      `  ${chalk.gray('Used')}       ${formatCredit(data.credit.used, data.credit.currency)} of ${formatCredit(data.credit.allocated, data.credit.currency)}`
    );
    log(
      `  ${chalk.gray('Remaining')}  ${formatCredit(data.credit.remaining, data.credit.currency)}`
    );
    log(`  ${chalk.gray('Progress')}   ${Math.round(data.credit.progress)}%`);
    log('');
  }

  const allServices = [...data.services.entries()];
  const sortedServices = visibleServices(data.services).sort(
    (a, b) => b[1].effectiveCost - a[1].effectiveCost
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
    printTable(print, usage, 'Infrastructure subtotal');
    log('');
  }

  if (subscriptions.length > 0) {
    log(chalk.bold('Subscription licenses'));
    printTable(print, subscriptions, 'Subscriptions subtotal');
    log('');
  }

  printBillSummary(
    print,
    usage,
    subscriptions,
    data.credit?.currency === data.costUnit ? data.credit.used : 0
  );
  outputHiddenServicesHint(allServices.length - sortedServices.length);
}

function formatCadence(
  cadence: NonNullable<NonNullable<UsageData['credit']>['cadence']>
): string {
  return cadence
    .split('_')
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function formatCredit(amount: number, currency: string): string {
  return currency === 'USD'
    ? formatCurrency(amount)
    : formatQuantity(amount, 'MIUs');
}

function printBillSummary(
  print: (message: string) => void,
  usage: [string, ServiceAggregation][],
  subscriptions: [string, ServiceAggregation][],
  creditsApplied = 0
): void {
  const subscriptionCost = sumEffectiveCost(subscriptions);
  const infrastructureCost = sumEffectiveCost(usage);
  const appliedCredit = Math.min(creditsApplied, infrastructureCost);
  const estimatedBill = subscriptionCost + infrastructureCost - appliedCredit;
  const rows = [
    ['Subscriptions', formatCurrency(subscriptionCost)],
    ['Infrastructure usage', formatCurrency(infrastructureCost)],
  ];

  if (appliedCredit > 0) {
    rows.push(['Credits applied', `-${formatCurrency(appliedCredit)}`]);
  }
  rows.push([
    chalk.bold('Estimated bill'),
    chalk.bold(formatCurrency(estimatedBill)),
  ]);

  const tablePrint = table(rows, { hsep: 4, align: ['l', 'r'] }).replace(
    /^/gm,
    '  '
  );
  print(`${tablePrint}\n`);
}

function sumEffectiveCost(services: [string, ServiceAggregation][]): number {
  return services.reduce(
    (total, [, service]) => total + service.effectiveCost,
    0
  );
}

function printTable(
  print: (message: string) => void,
  services: [string, ServiceAggregation][],
  subtotalLabel: string
): void {
  const headers = ['Service', 'Usage', 'Effective Cost'];
  const rows = services.map(([name, service]) => {
    return [
      service.included ? chalk.blue(name) : name,
      service.category === 'subscription'
        ? formatQuantity(service.quantity, service.unit ?? 'licenses', {
            compact: true,
          })
        : formatQuantity(service.quantity, service.unit ?? '', {
            compact: true,
          }).trim(),
      formatCurrency(service.effectiveCost),
    ];
  });
  const subtotal = services.reduce(
    (total, [, service]) => total + service.effectiveCost,
    0
  );
  rows.push([
    chalk.bold(subtotalLabel),
    '',
    chalk.bold(formatCurrency(subtotal)),
  ]);

  const tablePrint = table(
    [headers.map(header => chalk.bold(chalk.cyan(header))), ...rows],
    { hsep: 4, align: ['l', 'r', 'r'] }
  ).replace(/^/gm, '  ');

  print(`\n${tablePrint}\n`);
}
