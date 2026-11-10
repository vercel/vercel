import chalk from 'chalk';
import table from '../../util/output/table';
import output from '../../output-manager';
import elapsed from '../../util/output/elapsed';
import { formatUsageAmount, formatUsageQuantity } from './format';
import type { OutputOptions, GroupByDimension } from './types';
import {
  formatServiceCost,
  formatServiceName,
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
    (a, b) => b[1].totalCost - a[1].totalCost
  );
  if (sortedGroups.length === 0) {
    log('No usage data found for this period.');
    return;
  }

  let hiddenCount = 0;
  for (const [groupName, groupData] of sortedGroups) {
    const allServices = [...groupData.services.entries()];
    const services = visibleServices(groupData.services).sort(
      (a, b) => b[1].cost - a[1].cost
    );
    hiddenCount += allServices.length - services.length;
    if (services.length === 0) continue;

    log(
      `${chalk.bold(chalk.cyan(groupName))} (${formatUsageAmount(
        groupData.totalCost,
        data.costUnit
      )})`
    );
    const rows = services.map(([name, service]) => [
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

  log('');
  log(
    `${chalk.gray('Estimated total:')} ${chalk.bold(
      formatUsageAmount(data.totalCost, data.costUnit)
    )}`
  );
  outputHiddenServicesHint(hiddenCount);
}
