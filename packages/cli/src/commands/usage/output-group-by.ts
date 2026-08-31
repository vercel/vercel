import chalk from 'chalk';
import table from '../../util/output/table';
import output from '../../output-manager';
import elapsed from '../../util/output/elapsed';
import { formatCurrency, formatQuantity } from '../../util/billing/format';
import type { OutputOptions, GroupByDimension } from './types';

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

  log(
    `Usage by ${dimensionLabel} for ${chalk.bold(data.contextName)} ${elapsed(Date.now() - startTime)}`
  );
  log('');
  const periodSuffix = data.usingDefaults ? ' (current billing cycle)' : '';
  log(
    `${chalk.gray('Period:')} ${data.fromDisplay} to ${data.toDisplay}${periodSuffix}`
  );
  log('');

  const sortedGroups = [...data.groupByUsage.entries()].sort(
    (a, b) => b[1].totalCost - a[1].totalCost
  );
  if (sortedGroups.length === 0) {
    log('No usage data found for this period.');
    return;
  }

  for (const [groupName, groupData] of sortedGroups) {
    log(
      `${chalk.bold(chalk.cyan(groupName))} (${formatCurrency(groupData.totalCost)})`
    );
    const rows = [...groupData.services.entries()]
      .sort((a, b) => b[1].cost - a[1].cost)
      .map(([name, service]) => [
        service.included ? chalk.blue(name) : name,
        formatQuantity(service.quantity, service.unit),
        service.included ? 'Included' : formatCurrency(service.cost),
      ]);
    const tablePrint = table(
      [
        ['Service', 'Usage', 'Cost'].map(header =>
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
    `${chalk.gray('Estimated total:')} ${chalk.bold(formatCurrency(data.totalCost))}`
  );
}
