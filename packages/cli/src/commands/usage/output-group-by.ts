import chalk from 'chalk';
import table from '../../util/output/table';
import output from '../../output-manager';
import elapsed from '../../util/output/elapsed';
import { formatCurrency, formatQuantity } from '../../util/billing/format';
import type { OutputOptions, GroupByDimension } from './types';
import {
  outputHiddenServicesHint,
  outputUsageHeader,
  visibleServices,
} from './output-utils';

function getDimensionLabel(dimension: GroupByDimension): string {
  return dimension === 'project' ? 'Project' : 'Region';
}

export function outputGroupBy({
  data,
  groupByDimension,
  startTime,
}: OutputOptions): void {
  const { print, log } = output;
  const dimensionLabel = getDimensionLabel(groupByDimension!);

  outputUsageHeader(
    data,
    `Usage by ${dimensionLabel}`,
    elapsed(Date.now() - startTime)
  );

  const sortedGroups = [...data.groupByUsage.entries()].sort(
    (a, b) => b[1].totalEffectiveCost - a[1].totalEffectiveCost
  );
  if (sortedGroups.length === 0) {
    log('No usage data found for this period.');
    return;
  }

  let hiddenCount = 0;
  for (const [groupName, groupData] of sortedGroups) {
    const allServices = [...groupData.services.entries()];
    const services = visibleServices(groupData.services, data.showAll).sort(
      (a, b) => b[1].effectiveCost - a[1].effectiveCost
    );
    hiddenCount += allServices.length - services.length;
    if (services.length === 0) continue;

    log(
      `${chalk.bold(chalk.cyan(groupName))} (${formatCurrency(
        groupData.totalEffectiveCost
      )})`
    );
    const rows = services.map(([name, service]) => [
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

  log('');
  log(
    `${chalk.gray('Estimated total:')} ${chalk.bold(
      formatCurrency(data.grandTotals.effectiveCost)
    )}`
  );
  outputHiddenServicesHint(hiddenCount, data.scope);
}
