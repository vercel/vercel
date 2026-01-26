import chalk from 'chalk';
import jsonlines from 'jsonlines';
import table from '../../util/output/table';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import elapsed from '../../util/output/elapsed';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { help } from '../help';
import { usageCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { UsageTelemetryClient } from '../../util/telemetry/commands/usage';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import { isErrnoException } from '@vercel/error-utils';
import type { FocusCharge } from '../../util/billing/focus-charge';
import {
  parseBillingDate,
  getDefaultFromDate,
  getDefaultToDate,
  formatCurrency,
  formatQuantity,
  extractDatePortion,
} from '../../util/billing/format';

interface ServiceAggregation {
  pricingQuantity: number;
  effectiveCost: number;
  billedCost: number;
  pricingUnit: string;
}

export default async function usage(client: Client): Promise<number> {
  const { print, log, error, debug, spinner } = output;

  let parsedArgs = null;
  const flagsSpecification = getFlagsSpecification(usageCommand.options);

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const telemetry = new UsageTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('usage');
    print(help(usageCommand, { columns: client.stderr.columns }));
    return 0;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  // Get month-so-far or custom date range in LA time
  const fromDate = parsedArgs.flags['--from']
    ? parseBillingDate(parsedArgs.flags['--from'], false)
    : getDefaultFromDate();
  const toDate = parsedArgs.flags['--to']
    ? parseBillingDate(parsedArgs.flags['--to'], true)
    : getDefaultToDate();

  telemetry.trackCliOptionFrom(parsedArgs.flags['--from']);
  telemetry.trackCliOptionTo(parsedArgs.flags['--to']);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  if (parsedArgs.flags['--from']) {
    debug(`Date conversion: ${parsedArgs.flags['--from']} -> ${fromDate}`);
  }
  if (parsedArgs.flags['--to']) {
    debug(
      `Date conversion: ${parsedArgs.flags['--to']} (end of day) -> ${toDate}`
    );
  }

  let contextName: string;
  let teamId: string | undefined;

  try {
    const scope = await getScope(client);
    contextName = scope.contextName;
    teamId = scope.team?.id;
  } catch (err: unknown) {
    if (
      isErrnoException(err) &&
      (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED')
    ) {
      error(err.message);
      return 1;
    }
    throw err;
  }

  const start = Date.now();
  if (!asJson) {
    spinner(`Fetching usage data for ${chalk.bold(contextName)}`);
  }

  debug(`Fetching charges from ${fromDate} to ${toDate}`);

  const query = new URLSearchParams({
    from: fromDate,
    to: toDate,
  });
  if (teamId) {
    query.set('teamId', teamId);
  }

  try {
    const response = await client.fetch(`/v1/billing/charges?${query}`, {
      json: false,
      useCurrentTeam: false, // We're manually setting teamId
    });

    if (!response.ok) {
      const errorText = await response.text();
      error(`Failed to fetch usage data: ${response.status} ${errorText}`);
      return 1;
    }

    const services = new Map<string, ServiceAggregation>();
    let grandPricingQuantity = 0;
    let grandEffective = 0;
    let grandBilled = 0;
    let chargeCount = 0;
    let pricingUnit = 'MIUs'; // Default, will be updated from first charge

    await new Promise<void>((resolve, reject) => {
      // gzip compression is assumed
      const stream = response.body.pipe(jsonlines.parse());

      stream.on('data', (charge: FocusCharge) => {
        chargeCount++;

        // Capture pricing unit from the first charge
        if (chargeCount === 1 && charge.PricingUnit) {
          pricingUnit = charge.PricingUnit;
        }

        const serviceName = charge.ServiceName || 'Unknown';
        const quantity = charge.PricingQuantity || 0;
        const effective = charge.EffectiveCost || 0;
        const billed = charge.BilledCost || 0;

        // Accumulate grand totals
        grandPricingQuantity += quantity;
        grandEffective += effective;
        grandBilled += billed;

        // Accumulate per service
        const existing = services.get(serviceName) || {
          pricingQuantity: 0,
          effectiveCost: 0,
          billedCost: 0,
          pricingUnit: charge.PricingUnit || pricingUnit,
        };
        services.set(serviceName, {
          pricingQuantity: existing.pricingQuantity + quantity,
          effectiveCost: existing.effectiveCost + effective,
          billedCost: existing.billedCost + billed,
          pricingUnit: existing.pricingUnit,
        });
      });

      stream.on('end', resolve);
      stream.on('error', reject);
      response.body.on('error', reject);
    });

    const sortedServices = [...services.entries()].sort(
      (a, b) => b[1].billedCost - a[1].billedCost
    );

    if (asJson) {
      const jsonOutput = {
        period: {
          from: fromDate,
          to: toDate,
        },
        context: contextName,
        pricingUnit,
        services: sortedServices.map(([name, data]) => ({
          name,
          pricingQuantity: data.pricingQuantity,
          pricingUnit: data.pricingUnit,
          effectiveCost: data.effectiveCost,
          billedCost: data.billedCost,
        })),
        totals: {
          pricingQuantity: grandPricingQuantity,
          effectiveCost: grandEffective,
          billedCost: grandBilled,
        },
        chargeCount,
      };
      client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
      return 0;
    }

    log(`Usage for ${chalk.bold(contextName)} ${elapsed(Date.now() - start)}`);
    log('');
    log(
      `${chalk.gray('Period:')} ${extractDatePortion(fromDate)} to ${extractDatePortion(toDate)}`
    );
    log(`${chalk.gray('Charges processed:')} ${chargeCount}`);
    log(`${chalk.gray('Pricing unit:')} ${pricingUnit}`);
    log('');

    if (sortedServices.length === 0) {
      log('No usage data found for this period.');
      return 0;
    }

    const quantityHeader = pricingUnit === 'USD' ? 'Usage (USD)' : pricingUnit;
    const headers = [
      'Service',
      quantityHeader,
      'Effective Cost',
      'Billed Cost',
    ];
    const rows = sortedServices.map(([name, data]) => [
      name,
      formatQuantity(data.pricingQuantity, data.pricingUnit),
      formatCurrency(data.effectiveCost),
      formatCurrency(data.billedCost),
    ]);

    rows.push([
      chalk.bold('Total'),
      chalk.bold(formatQuantity(grandPricingQuantity, pricingUnit)),
      chalk.bold(formatCurrency(grandEffective)),
      chalk.bold(formatCurrency(grandBilled)),
    ]);

    const tablePrint = table(
      [headers.map(h => chalk.bold(chalk.cyan(h))), ...rows],
      { hsep: 4, align: ['l', 'r', 'r', 'r'] }
    ).replace(/^/gm, '  ');

    print(`\n${tablePrint}\n\n`);

    log(
      `${chalk.gray('Amount due:')} ${chalk.bold(formatCurrency(grandBilled))}`
    );

    return 0;
  } catch (err) {
    output.prettyError(err);
    return 1;
  }
}
