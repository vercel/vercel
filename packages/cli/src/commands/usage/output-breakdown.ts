import chalk from 'chalk';
import table from '../../util/output/table';
import output from '../../output-manager';
import elapsed from '../../util/output/elapsed';
import { formatUsageAmount, formatUsageQuantity } from './format';
import type { OutputOptions, BreakdownPeriod } from './types';
import {
  formatServiceCost,
  formatServiceName,
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
    const sortedServices = visibleServices(periodData.services).sort(
      (a, b) => b[1].cost - a[1].cost
    );
    hiddenCount += allServices.length - sortedServices.length;
    if (sortedServices.length === 0) continue;

    log(
      `${chalk.bold(chalk.cyan(periodKey))} (${formatUsageAmount(
        periodData.totalCost,
        data.costUnit
      )})`
    );

    const rows = sortedServices.map(([name, service]) => [
      formatServiceName(name, service),
      formatUsageQuantity(service.quantity, service.unit, {
        compact: true,
        showSmallValues: true,
        singularUnit: service.singularUnit,
        unitKind: service.unitKind,
      }),
      formatServiceCost(service, data.costUnit),
    ]);
    const tablePrint = table(
      [
        ['Service', 'Usage', 'Cost'].map(header =>
          chalk.bold(chalk.gray(header))
        ),
        ...rows,
      ],
      { hsep: 4, align: ['l', 'l', 'r'] }
    ).replace(/^/gm, '  ');
    print(`${tablePrint}\n`);
  }
  outputHiddenServicesHint(hiddenCount);
}
