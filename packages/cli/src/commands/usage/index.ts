import chalk from 'chalk';
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
import { isErrnoException } from '@vercel/error-utils';
import {
  getDefaultFromDate,
  getDefaultToDate,
  getPeriodKey,
  parseBillingDate,
  isValidBreakdownPeriod,
  VALID_BREAKDOWN_PERIODS,
} from '../../util/billing/period-utils';
import {
  isValidGroupByDimension,
  VALID_GROUP_BY_DIMENSIONS,
} from '../../util/billing/group-by-utils';
import { extractDatePortion } from '../../util/billing/format';
import { outputAggregated } from './output-aggregated';
import { outputBreakdown } from './output-breakdown';
import { outputGroupBy } from './output-group-by';
import { outputJson } from './output-json';
import type {
  BreakdownPeriod,
  CommitmentUsageResponse,
  CostMetricGroup,
  CostMetricsResponse,
  GroupAggregation,
  GroupByDimension,
  PeriodAggregation,
  ServiceAggregation,
  UsageData,
} from './types';

const GROSS_COST_METRIC = 'gross_cost';
// TODO: Add `net_cost` once the billing costs API contract supports it.

export default async function usage(client: Client): Promise<number> {
  const { print, error, debug, spinner } = output;
  const flagsSpecification = getFlagsSpecification(usageCommand.options);
  let parsedArgs;

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const telemetry = new UsageTelemetryClient({
    opts: { store: client.telemetryEventStore },
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
      'Both --from and --to must be specified or neither for the current billing cycle'
    );
    return 1;
  }

  const breakdownFlag = parsedArgs.flags['--breakdown'];
  if (breakdownFlag && !isValidBreakdownPeriod(breakdownFlag)) {
    error(
      `Invalid breakdown period: "${breakdownFlag}". Valid options are: ${VALID_BREAKDOWN_PERIODS.join(', ')}`
    );
    return 1;
  }
  const breakdownPeriod = breakdownFlag as BreakdownPeriod | undefined;

  const groupByFlag = parsedArgs.flags['--group-by'];
  if (groupByFlag && !isValidGroupByDimension(groupByFlag)) {
    error(
      `Invalid group-by dimension: "${groupByFlag}". Valid options are: ${VALID_GROUP_BY_DIMENSIONS.join(', ')}`
    );
    return 1;
  }
  const groupByDimension = groupByFlag as GroupByDimension | undefined;

  if (breakdownPeriod && groupByDimension) {
    error(
      '--breakdown and --group-by cannot be used together. Use one or the other.'
    );
    return 1;
  }

  telemetry.trackCliOptionFrom(fromFlag);
  telemetry.trackCliOptionTo(toFlag);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliOptionBreakdown(breakdownFlag);
  telemetry.trackCliOptionGroupBy(groupByFlag);

  let contextName: string;
  let contextType: 'team' | 'personal account';
  let teamId: string | undefined;
  let billingPeriod: { start: number; end: number } | undefined;
  let hasPrecommitment = false;

  try {
    const scope = await getScope(client);
    const owner = scope.team ?? scope.user;
    contextName = scope.contextName;
    contextType = scope.team ? 'team' : 'personal account';
    teamId = scope.team?.id;
    billingPeriod = owner.billing?.period;
    const billing = owner.billing as
      | { plan?: string; planIteration?: string }
      | undefined;
    hasPrecommitment =
      billing?.plan === 'enterprise' ||
      billing?.planIteration === 'plus' ||
      (billing?.plan === 'pro' && billing?.planIteration === 'flex');
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

  const usingDefaults = !fromFlag && !toFlag;
  let fromDate: string;
  let toDate: string;
  try {
    fromDate = fromFlag
      ? parseBillingDate(fromFlag, false)
      : billingPeriod
        ? new Date(billingPeriod.start).toISOString()
        : getDefaultFromDate();
    toDate = toFlag
      ? parseBillingDate(toFlag, true)
      : billingPeriod
        ? new Date(billingPeriod.end).toISOString()
        : getDefaultToDate();
  } catch (err) {
    error((err as Error).message);
    return 1;
  }

  const fromDisplay = fromFlag ?? extractDatePortion(fromDate);
  const toDisplay = toFlag ?? extractDatePortion(toDate);
  debug(`Fetching dashboard usage from ${fromDate} to ${toDate}`);

  const start = Date.now();
  if (!asJson) {
    spinner(`Fetching usage data for ${chalk.bold(contextName)}`);
  }

  try {
    const query = new URLSearchParams();
    if (teamId) query.set('teamId', teamId);
    const views: Record<string, { groupBy: string[] }> = {
      byProduct: { groupBy: ['product'] },
    };
    if (groupByDimension) {
      views.byProductRegionProject = {
        groupBy: ['product', 'region', 'project'],
      };
    }

    const costsRequest = client.fetch<CostMetricsResponse>(
      `/v2/billing/costs${query.size > 0 ? `?${query}` : ''}`,
      {
        method: 'POST',
        body: {
          from: fromDate,
          to: toDate,
          currency: 'USD',
          // TODO: Request `net_cost` here once the billing costs API PR lands.
          metrics: [GROSS_COST_METRIC, 'quantity'],
          format: 'timeseries',
          views,
          userAgent: 'vercel-cli.usage',
        },
        useCurrentTeam: false,
      }
    );
    const commitmentRequest =
      usingDefaults && teamId && hasPrecommitment
        ? client
            .fetch<CommitmentUsageResponse>(
              `/v1/invoices/pre-commitment-usage?teamId=${encodeURIComponent(teamId)}`,
              { useCurrentTeam: false }
            )
            .catch(err => {
              debug(`Unable to fetch infrastructure credit: ${String(err)}`);
              return null;
            })
        : Promise.resolve(null);

    const [response, commitmentUsage] = await Promise.all([
      costsRequest,
      commitmentRequest,
    ]);

    const usageData = processCosts(response, {
      contextName,
      contextType,
      scope: parsedArgs.flags['--scope'],
      fromDisplay,
      toDisplay,
      usingDefaults,
      breakdownPeriod,
      groupByDimension,
    });
    const creditLedger = commitmentUsage?.creditLedgers[0];
    if (creditLedger) {
      const used = roundToHundredths(
        creditLedger.total - creditLedger.remaining
      );
      usageData.credit = {
        cadence: commitmentUsage.cadence,
        currency: creditLedger.currency,
        allocated: creditLedger.total,
        used,
        remaining: creditLedger.remaining,
        progress:
          creditLedger.total > 0
            ? roundToHundredths((used / creditLedger.total) * 100)
            : 0,
      };
    }

    if (asJson) {
      outputJson(client, {
        data: usageData,
        fromDate,
        toDate,
        breakdownPeriod,
        groupByDimension,
      });
      return 0;
    }

    if (groupByDimension) {
      outputGroupBy({ data: usageData, groupByDimension, startTime: start });
    } else if (breakdownPeriod) {
      outputBreakdown({ data: usageData, breakdownPeriod, startTime: start });
    } else {
      outputAggregated({ data: usageData, startTime: start });
    }
    return 0;
  } catch (err) {
    output.prettyError(err);
    return 1;
  }
}

function roundToHundredths(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getUsageThrough(queriedAt: string, toDisplay: string): string {
  const queriedDate = extractDatePortion(queriedAt);
  return queriedDate < toDisplay ? queriedDate : toDisplay;
}

function processCosts(
  response: CostMetricsResponse,
  options: {
    contextName: string;
    contextType: 'team' | 'personal account';
    scope?: string;
    fromDisplay: string;
    toDisplay: string;
    usingDefaults: boolean;
    breakdownPeriod?: BreakdownPeriod;
    groupByDimension?: GroupByDimension;
  }
): UsageData {
  const {
    contextName,
    contextType,
    scope,
    fromDisplay,
    toDisplay,
    usingDefaults,
    breakdownPeriod,
    groupByDimension,
  } = options;
  const products = response.results.dimensionsMeta.product?.values ?? {};
  const projects = response.results.dimensionsMeta.project?.values ?? {};
  const regions = response.results.dimensionsMeta.region?.values ?? {};
  const summaryView = response.results.views.byProduct;
  const detailView = response.results.views.byProductRegionProject;
  if (
    groupByDimension &&
    (!detailView || !detailView.groupBy.includes(groupByDimension))
  ) {
    throw new Error(
      `Usage cannot be grouped by ${groupByDimension} for this team.`
    );
  }
  const services = new Map<string, ServiceAggregation>();
  const periodUsage = new Map<string, PeriodAggregation>();
  const groupByUsage = new Map<string, GroupAggregation>();
  let totalCost = 0;
  let totalEffectiveCost = 0;

  for (const result of summaryView?.results ?? []) {
    const product = result.dimensionValues.product;
    if (!product) continue;
    const productMetadata = products[product];
    const serviceName = productMetadata?.title ?? product;
    const aggregation = aggregateResult(
      result,
      undefined,
      productMetadata?.category === 'Subscription Licenses'
    );
    addService(services, serviceName, aggregation);
    totalCost += aggregation.cost;
    totalEffectiveCost += aggregation.effectiveCost;

    if (breakdownPeriod) {
      for (let index = 0; index < response.results.times.length; index++) {
        const periodKey = getPeriodKey(
          response.results.times[index],
          breakdownPeriod
        );
        const period = periodUsage.get(periodKey) ?? emptyAggregation();
        const sample = aggregateResult(
          result,
          index,
          productMetadata?.category === 'Subscription Licenses'
        );
        addService(period.services, serviceName, sample);
        period.totalCost += sample.cost;
        period.totalEffectiveCost += sample.effectiveCost;
        periodUsage.set(periodKey, period);
      }
    }
  }

  if (groupByDimension) {
    for (const result of detailView?.results ?? []) {
      const product = result.dimensionValues.product;
      if (!product) continue;
      const productMetadata = products[product];
      const serviceName = productMetadata?.title ?? product;
      const aggregation = aggregateResult(
        result,
        undefined,
        productMetadata?.category === 'Subscription Licenses'
      );
      const id = result.dimensionValues[groupByDimension];
      const fallback =
        groupByDimension === 'project' ? '(unattributed)' : '(global)';
      const metadata = groupByDimension === 'project' ? projects : regions;
      const groupName = id ? (metadata[id]?.title ?? id) : fallback;
      const group = groupByUsage.get(groupName) ?? emptyAggregation();
      addService(group.services, serviceName, aggregation);
      group.totalCost += aggregation.cost;
      group.totalEffectiveCost += aggregation.effectiveCost;
      groupByUsage.set(groupName, group);
    }
  }

  return {
    contextName,
    contextType,
    scope,
    fromDisplay,
    toDisplay,
    usageThrough: getUsageThrough(response.queriedAt, toDisplay),
    usingDefaults,
    costUnit: 'USD',
    services,
    periodUsage,
    groupByUsage,
    totalCost,
    grandTotals: {
      effectiveCost: totalEffectiveCost,
    },
  };
}

function aggregateResult(
  result: CostMetricGroup,
  sampleIndex?: number,
  isSubscription = false
): ServiceAggregation {
  const grossCostIndex = result.metrics.indexOf(GROSS_COST_METRIC);
  const quantityIndex = result.metrics.indexOf('quantity');
  const values =
    sampleIndex === undefined
      ? result.totalValue
      : (result.values[sampleIndex] ?? []);
  const cost = grossCostIndex === -1 ? 0 : (values[grossCostIndex] ?? 0);
  const included = result.flatRate === true;
  // TODO: Read `net_cost` directly once the billing costs API PR lands.
  const effectiveCost = included ? 0 : cost;
  const rawQuantity = quantityIndex === -1 ? 0 : (values[quantityIndex] ?? 0);
  const quantity = isSubscription ? rawQuantity || 1 : rawQuantity;
  const unit = isSubscription
    ? quantity === 1
      ? 'license'
      : 'licenses'
    : undefined;

  return {
    quantity,
    unit,
    cost,
    included,
    category: isSubscription ? 'subscription' : 'usage',
    effectiveCost,
  };
}

function addService(
  services: Map<string, ServiceAggregation>,
  name: string,
  value: ServiceAggregation
): void {
  const existing = services.get(name);
  if (!existing) {
    services.set(name, { ...value });
    return;
  }
  existing.quantity += value.quantity;
  existing.cost += value.cost;
  existing.included &&= value.included;
  existing.effectiveCost += value.effectiveCost;
}

function emptyAggregation(): PeriodAggregation {
  return {
    services: new Map(),
    totalCost: 0,
    totalEffectiveCost: 0,
  };
}
