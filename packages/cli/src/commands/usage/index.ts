import chalk from 'chalk';
import { DateTime } from 'luxon';
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
  CostMetric,
  CostMetricGroup,
  CostMetricsResponse,
  GroupAggregation,
  GroupByDimension,
  PeriodAggregation,
  ServiceAggregation,
  UsageData,
} from './types';

const COST_METRIC = 'gross_cost';

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
  let teamId: string | undefined;
  let billingPeriod: { start: number; end: number } | undefined;

  try {
    const scope = await getScope(client);
    contextName = scope.contextName;
    teamId = scope.team?.id;
    billingPeriod = (scope.team ?? scope.user).billing?.period;
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
      ? parseDashboardDate(fromFlag, false)
      : billingPeriod
        ? new Date(billingPeriod.start).toISOString()
        : getDefaultFromDate();
    toDate = toFlag
      ? parseDashboardDate(toFlag, true)
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
    const query = new URLSearchParams({ from: fromDate, to: toDate });
    if (teamId) query.set('teamId', teamId);

    const response = await client.fetch<CostMetricsResponse>(
      `/v2/billing/costs?${query}`,
      {
        method: 'POST',
        body: {
          from: fromDate,
          to: toDate,
          format: 'timeseries',
          views: {
            byProduct: { groupBy: ['product'] },
            byProductRegionProject: {
              groupBy: ['product', 'region', 'project'],
            },
          },
          userAgent: 'vercel-cli.usage',
        },
        useCurrentTeam: false,
      }
    );

    const usageData = processCosts(
      response,
      contextName,
      fromDisplay,
      toDisplay,
      usingDefaults,
      breakdownPeriod,
      groupByDimension
    );

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

function parseDashboardDate(value: string, end: boolean): string {
  const date = value.includes('T')
    ? DateTime.fromISO(value)
    : DateTime.fromISO(value, { zone: 'America/Los_Angeles' }).startOf('day');
  if (!date.isValid) {
    throw new Error(
      `Invalid date: "${value}". Expected ISO 8601 format (YYYY-MM-DD)`
    );
  }
  return (end && !value.includes('T') ? date.plus({ days: 1 }) : date)
    .toUTC()
    .toISO()!;
}

function processCosts(
  response: CostMetricsResponse,
  contextName: string,
  fromDisplay: string,
  toDisplay: string,
  usingDefaults: boolean,
  breakdownPeriod?: BreakdownPeriod,
  groupByDimension?: GroupByDimension
): UsageData {
  const metrics = new Map(
    response.metrics.map(metric => [metric.slug, metric])
  );
  const products = response.results.dimensionsMeta.product?.values ?? {};
  const projects = response.results.dimensionsMeta.project?.values ?? {};
  const regions = response.results.dimensionsMeta.region?.values ?? {};
  const summaryView = response.results.views.byProduct;
  const detailView = response.results.views.byProductRegionProject;
  const services = new Map<string, ServiceAggregation>();
  const periodUsage = new Map<string, PeriodAggregation>();
  const groupByUsage = new Map<string, GroupAggregation>();
  let totalCost = 0;

  for (const result of summaryView?.results ?? []) {
    const product = result.dimensionValues.product;
    if (!product) continue;
    const productMetadata = products[product];
    const serviceName = productMetadata?.title ?? product;
    const aggregation = aggregateResult(
      result,
      metrics,
      undefined,
      productMetadata?.category === 'Subscription Licenses'
    );
    const aggregationName = aggregation.included
      ? `${serviceName} (Flat Rate CDN)`
      : serviceName;
    addService(services, aggregationName, aggregation);
    totalCost += aggregation.cost;

    if (breakdownPeriod) {
      for (let index = 0; index < response.results.times.length; index++) {
        const periodKey = getPeriodKey(
          response.results.times[index],
          breakdownPeriod
        );
        const period = periodUsage.get(periodKey) ?? emptyPeriod();
        const sample = aggregateResult(
          result,
          metrics,
          index,
          productMetadata?.category === 'Subscription Licenses'
        );
        addService(period.services, aggregationName, sample);
        period.totalCost += sample.cost;
        period.totalPricingQuantity += sample.cost;
        period.totalEffectiveCost += sample.cost;
        period.totalBilledCost += sample.cost;
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
        metrics,
        undefined,
        productMetadata?.category === 'Subscription Licenses'
      );
      const aggregationName = aggregation.included
        ? `${serviceName} (Flat Rate CDN)`
        : serviceName;
      const id = result.dimensionValues[groupByDimension];
      const fallback =
        groupByDimension === 'project' ? '(unattributed)' : '(global)';
      const metadata = groupByDimension === 'project' ? projects : regions;
      const groupName = id ? (metadata[id]?.title ?? id) : fallback;
      const group = groupByUsage.get(groupName) ?? emptyGroup();
      addService(group.services, aggregationName, aggregation);
      group.totalCost += aggregation.cost;
      group.totalPricingQuantity += aggregation.cost;
      group.totalEffectiveCost += aggregation.cost;
      group.totalBilledCost += aggregation.cost;
      groupByUsage.set(groupName, group);
    }
  }

  return {
    contextName,
    fromDisplay,
    toDisplay,
    usingDefaults,
    chargeCount: summaryView?.results.length ?? 0,
    services,
    periodUsage,
    groupByUsage,
    totalCost,
    grandTotals: {
      pricingQuantity: totalCost,
      effectiveCost: totalCost,
      billedCost: totalCost,
    },
  };
}

function aggregateResult(
  result: CostMetricGroup,
  metrics: Map<string, CostMetric>,
  sampleIndex?: number,
  isSubscription = false
): ServiceAggregation {
  const costIndex = result.metrics.indexOf(COST_METRIC);
  const quantityIndex = result.metrics.findIndex(
    metric => metric !== COST_METRIC
  );
  const values =
    sampleIndex === undefined
      ? result.totalValue
      : (result.values[sampleIndex] ?? []);
  const cost = costIndex === -1 ? 0 : (values[costIndex] ?? 0);
  const quantity = quantityIndex === -1 ? 0 : (values[quantityIndex] ?? 0);
  const metric =
    quantityIndex === -1
      ? undefined
      : metrics.get(result.metrics[quantityIndex]);
  const unit = getUnitLabel(metric, quantity);

  return {
    quantity,
    unit,
    cost,
    included: result.flatRate === true,
    category: isSubscription ? 'subscription' : 'usage',
    pricingQuantity: cost,
    pricingUnit: 'USD',
    effectiveCost: cost,
    billedCost: cost,
  };
}

function getUnitLabel(
  metric: CostMetric | undefined,
  quantity: number
): string {
  if (!metric) return 'licenses';
  if (metric.unit.kind === 'custom') {
    return quantity === 1
      ? (metric.unit.singular ?? metric.unit.plural ?? metric.title)
      : (metric.unit.plural ?? metric.unit.singular ?? metric.title);
  }
  return metric.unit.name ?? metric.title;
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
  existing.included ||= value.included;
  existing.pricingQuantity += value.pricingQuantity;
  existing.effectiveCost += value.effectiveCost;
  existing.billedCost += value.billedCost;
}

function emptyPeriod(): PeriodAggregation {
  return {
    services: new Map(),
    totalCost: 0,
    totalPricingQuantity: 0,
    totalEffectiveCost: 0,
    totalBilledCost: 0,
  };
}

function emptyGroup(): GroupAggregation {
  return {
    services: new Map(),
    totalCost: 0,
    totalPricingQuantity: 0,
    totalEffectiveCost: 0,
    totalBilledCost: 0,
  };
}
