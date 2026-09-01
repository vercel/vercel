import chalk from 'chalk';
import table from '../../util/output/table';
import output from '../../output-manager';
import elapsed from '../../util/output/elapsed';
import { formatCurrency, formatQuantity } from '../../util/billing/format';
import type { OutputOptions, BreakdownPeriod } from './types';
import {
  outputHiddenServicesHint,
  outputUsageHeader,
  visibleServices,
} from './output-utils';

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

  outputUsageHeader(
    data,
    `${periodLabel} usage`,
    elapsed(Date.now() - startTime)
  );

  const sortedPeriods = [...data.periodUsage.keys()].sort();
  if (sortedPeriods.length === 0) {
    log('No usage data found for this period.');
    return;
  }

  let hiddenCount = 0;
  for (const periodKey of sortedPeriods) {
    const periodData = data.periodUsage.get(periodKey)!;
    const allServices = [...periodData.services.entries()];
    const sortedServices = visibleServices(
      periodData.services,
      data.showAll
    ).sort((a, b) => b[1].effectiveCost - a[1].effectiveCost);
    hiddenCount += allServices.length - sortedServices.length;
    if (sortedServices.length === 0) continue;

    log(
      `${chalk.bold(chalk.cyan(periodKey))} (${formatCurrency(
        periodData.totalEffectiveCost
      )})`
    );

    const rows = sortedServices.map(([name, service]) => [
      service.included ? chalk.blue(name) : name,
      formatQuantity(service.quantity, service.unit),
      formatCurrency(service.effectiveCost),
    ]);
    const tablePrint = table(
      [
        ['Service', 'Usage', 'Effective Cost'].map(header =>
          chalk.bold(chalk.gray(header))
        ),
        ...rows,
      ],
      { hsep: 4, align: ['l', 'r', 'r'] }
    ).replace(/^/gm, '  ');
    print(`${tablePrint}\n`);
  }
  outputHiddenServicesHint(hiddenCount, data.scope);
}
