import chalk from 'chalk';
import { DateTime } from 'luxon';
import output from '../../output-manager';
import type { ServiceAggregation, UsageData } from './types';

export function isEmptyService(service: ServiceAggregation): boolean {
  return (
    service.quantity === 0 && service.cost === 0 && service.effectiveCost === 0
  );
}

export function visibleServices(
  services: Map<string, ServiceAggregation>,
  showAll: boolean
): [string, ServiceAggregation][] {
  return [...services.entries()].filter(
    ([, service]) => showAll || !isEmptyService(service)
  );
}

export function outputUsageHeader(
  data: UsageData,
  title: string,
  elapsedSuffix: string
): void {
  const { log } = output;
  log(
    `${title} for ${data.contextType} ${chalk.bold(data.contextName)} ${elapsedSuffix}`
  );
  log('');
  if (data.usingDefaults) {
    log(
      `${chalk.gray('Billing cycle:')} ${formatRange(data.fromDisplay, data.toDisplay)}`
    );
  } else {
    log(
      `${chalk.gray('Period:')} ${formatRange(data.fromDisplay, data.toDisplay)}`
    );
  }
  log(`${chalk.gray('Usage through:')} ${formatDate(data.usageThrough)}`);
  log(chalk.gray('Costs are accrued through this date, not forecast.'));
  log('');
}

export function outputHiddenServicesHint(
  hiddenCount: number,
  scope?: string
): void {
  if (hiddenCount <= 0) return;
  const scopeFlag = scope ? ` --scope ${scope}` : '';
  output.log(
    chalk.gray(
      `${hiddenCount} ${hiddenCount === 1 ? 'service' : 'services'} with no usage hidden. Show all with: vc usage${scopeFlag} --all`
    )
  );
}

function formatRange(from: string, to: string): string {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end) return `${from} to ${to}`;

  const sameYear = start.year === end.year;
  const startText = start.toFormat(sameYear ? 'LLL d' : 'LLL d, yyyy');
  return `${startText}–${end.toFormat('LLL d, yyyy')}`;
}

function formatDate(value: string): string {
  return parseDate(value)?.toFormat('LLL d, yyyy') ?? value;
}

function parseDate(value: string): DateTime | null {
  const date = DateTime.fromISO(value, { zone: 'utc' });
  return date.isValid ? date : null;
}
