import chalk from 'chalk';
import jsonlines from 'jsonlines';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { help } from '../help';
import { usageCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { UsageTelemetryClient } from '../../util/telemetry/commands/usage';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import { toNodeReadable } from '../../util/web-stream';
import { isErrnoException } from '@vercel/error-utils';
import type { FocusCharge } from '../../util/billing/focus-charge';
import type {
  BreakdownPeriod,
  ServiceAggregation,
  PeriodAggregation,
  UsageData,
} from './types';
import {
  parseBillingDate,
  getDefaultFromDate,
  getDefaultToDate,
  getDefaultFromDateDisplay,
  getDefaultToDateDisplay,
  getPeriodKey,
  isValidBreakdownPeriod,
  VALID_BREAKDOWN_PERIODS,
} from '../../util/billing/period-utils';
import { outputAggregated } from './output-aggregated';
import { outputBreakdown } from './output-breakdown';
import { outputJson } from './output-json';

export default async function usage(client: Client): Promise<number> {
  const { print, error, debug, spinner } = output;

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

  const fromFlag = parsedArgs.flags['--from'];
  const toFlag = parsedArgs.flags['--to'];

  if (Boolean(fromFlag) !== Boolean(toFlag)) {
    error(
      'Both --from and --to must be specified or neither for the current month'
    );
    return 1;
  }
  const usingDefaults = !fromFlag && !toFlag;

  let fromDate: string;
  let toDate: string;
  try {
    fromDate = fromFlag
      ? parseBillingDate(fromFlag, false)
      : getDefaultFromDate();
    toDate = toFlag ? parseBillingDate(toFlag, true) : getDefaultToDate();
  } catch (err) {
    error((err as Error).message);
    return 1;
  }

  const fromDisplay = fromFlag ?? getDefaultFromDateDisplay();
  const toDisplay = toFlag ?? getDefaultToDateDisplay();

  const breakdownFlag = parsedArgs.flags['--breakdown'];
  let breakdownPeriod: BreakdownPeriod | undefined;

  if (breakdownFlag) {
    if (!isValidBreakdownPeriod(breakdownFlag)) {
      error(
        `Invalid breakdown period: "${breakdownFlag}". Valid options are: ${VALID_BREAKDOWN_PERIODS.join(', ')}`
      );
      return 1;
    }
    breakdownPeriod = breakdownFlag;
  }

  telemetry.trackCliOptionFrom(fromFlag);
  telemetry.trackCliOptionTo(toFlag);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliOptionBreakdown(breakdownFlag);

  if (fromFlag) {
    debug(`Date conversion: ${fromFlag} -> ${fromDate}`);
  }
  if (toFlag) {
    debug(`Date conversion: ${toFlag} (end of day) -> ${toDate}`);
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
      useCurrentTeam: false,
    });

    if (!response.ok) {
      const errorText = await response.text();
      error(`Failed to fetch usage data: ${response.status} ${errorText}`);
      return 1;
    }

    const usageData = await processCharges(
      response,
      breakdownPeriod,
      contextName,
      fromDisplay,
      toDisplay,
      usingDefaults
    );

    if (asJson) {
      outputJson(client, {
        data: usageData,
        fromDate,
        toDate,
        breakdownPeriod,
      });
      return 0;
    }

    if (breakdownPeriod) {
      outputBreakdown({
        data: usageData,
        breakdownPeriod,
        startTime: start,
      });
    } else {
      outputAggregated({
        data: usageData,
        startTime: start,
      });
    }

    return 0;
  } catch (err) {
    output.prettyError(err);
    return 1;
  }
}

async function processCharges(
  response: Response,
  breakdownPeriod: BreakdownPeriod | undefined,
  contextName: string,
  fromDisplay: string,
  toDisplay: string,
  usingDefaults: boolean
): Promise<UsageData> {
  const services = new Map<string, ServiceAggregation>();
  const periodUsage = new Map<string, PeriodAggregation>();
  let grandPricingQuantity = 0;
  let grandEffective = 0;
  let grandBilled = 0;
  let chargeCount = 0;
  let pricingUnit = 'MIUs';

  await new Promise<void>((resolve, reject) => {
    // gzip compression is assumed
    const body = toNodeReadable(response.body!);
    const stream = body.pipe(jsonlines.parse());

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

      // Accumulate per period per service (for breakdown view)
      if (breakdownPeriod) {
        const periodKey = getPeriodKey(
          charge.ChargePeriodStart,
          breakdownPeriod
        );

        if (!periodUsage.has(periodKey)) {
          periodUsage.set(periodKey, {
            services: new Map(),
            totalPricingQuantity: 0,
            totalEffectiveCost: 0,
            totalBilledCost: 0,
          });
        }
        const periodData = periodUsage.get(periodKey)!;
        periodData.totalPricingQuantity += quantity;
        periodData.totalEffectiveCost += effective;
        periodData.totalBilledCost += billed;

        const periodService = periodData.services.get(serviceName) || {
          pricingQuantity: 0,
          effectiveCost: 0,
          billedCost: 0,
          pricingUnit: charge.PricingUnit || pricingUnit,
        };
        periodData.services.set(serviceName, {
          pricingQuantity: periodService.pricingQuantity + quantity,
          effectiveCost: periodService.effectiveCost + effective,
          billedCost: periodService.billedCost + billed,
          pricingUnit: periodService.pricingUnit,
        });
      }
    });

    stream.on('end', resolve);
    stream.on('error', reject);
    body.on('error', reject);
  });

  return {
    contextName,
    fromDisplay,
    toDisplay,
    usingDefaults,
    pricingUnit,
    chargeCount,
    services,
    periodUsage,
    grandTotals: {
      pricingQuantity: grandPricingQuantity,
      effectiveCost: grandEffective,
      billedCost: grandBilled,
    },
  };
}
