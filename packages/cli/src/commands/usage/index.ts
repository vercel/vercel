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
import { isAPIError } from '../../util/errors-ts';
import {
  getDefaultFromDate,
  getDefaultToDate,
  getPeriodKey,
  isRelativeTime,
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
  CostMetric,
  CostMetricGroup,
  CostMetricsResponse,
  CostMetricView,
  GroupAggregation,
  GroupByDimension,
  PeriodAggregation,
  ServiceAggregation,
  UsageData,
} from './types';

const GROSS_COST_METRIC = 'gross_cost';
const SUMMARY_VIEW = 'byProduct';
const DETAIL_VIEW = 'byProductRegionProject';
// TODO: Add `net_cost` once the billing costs API contract supports it.

type CostViewRequest = Record<string, { groupBy: string[] }>;

function getCostViews(groupByDimension?: GroupByDimension): {
  views: CostViewRequest;
  summaryViewName: string;
  detailViewName?: string;
} {
  const views: CostViewRequest = {};

  if (groupByDimension) {
    views[DETAIL_VIEW] = {
      groupBy: ['product', 'region', 'project'],
    };
  }
  views[SUMMARY_VIEW] = { groupBy: ['product'] };

  return {
    views,
    summaryViewName: SUMMARY_VIEW,
    detailViewName: groupByDimension ? DETAIL_VIEW : undefined,
  };
}

export default async function usage(client: Client): Promise<number> {
  const { print, error, debug, spinner, warn } = output;
  const flagsSpecification = getFlagsSpecification(usageCommand.options);
  let parsedArgs;

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 2;
  }

  const telemetry = new UsageTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('usage');
    print(
      help(usageCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;
  const fromFlag = parsedArgs.flags['--from'];
  const toFlag = parsedArgs.flags['--to'];

  if (fromFlag !== undefined && parsedArgs.flags['--since'] !== undefined) {
    error('Pass only one of --since or --from. (--from is deprecated.)');
    return 2;
  }
  if (toFlag !== undefined && parsedArgs.flags['--until'] !== undefined) {
    error('Pass only one of --until or --to. (--to is deprecated.)');
    return 2;
  }
  if (fromFlag !== undefined) {
    warn('`--from` is deprecated, please use `--since` instead');
  }
  if (toFlag !== undefined) {
    warn('`--to` is deprecated, please use `--until` instead');
  }

  const sinceFlag = parsedArgs.flags['--since'] ?? fromFlag;
  const untilFlag = parsedArgs.flags['--until'] ?? toFlag;

  if (untilFlag && !sinceFlag) {
    error(
      '--until requires --since. Omit both to show the current billing cycle.'
    );
    return 2;
  }

  const breakdownFlag = parsedArgs.flags['--breakdown'];
  if (breakdownFlag && !isValidBreakdownPeriod(breakdownFlag)) {
    error(
      `Invalid breakdown period: "${breakdownFlag}". Valid options are: ${VALID_BREAKDOWN_PERIODS.join(', ')}`
    );
    return 2;
  }
  const breakdownPeriod = breakdownFlag as BreakdownPeriod | undefined;

  const groupByFlag = parsedArgs.flags['--group-by'];
  if (groupByFlag && !isValidGroupByDimension(groupByFlag)) {
    error(
      `Invalid group-by dimension: "${groupByFlag}". Valid options are: ${VALID_GROUP_BY_DIMENSIONS.join(', ')}`
    );
    return 2;
  }
  const groupByDimension = groupByFlag as GroupByDimension | undefined;

  if (breakdownPeriod && groupByDimension) {
    error(
      '--breakdown and --group-by cannot be used together. Use one or the other.'
    );
    return 2;
  }

  let sinceDate: string | undefined;
  let untilDate: string | undefined;
  try {
    sinceDate = sinceFlag ? parseBillingDate(sinceFlag, false) : undefined;
    untilDate = untilFlag ? parseBillingDate(untilFlag, true) : undefined;
  } catch (err) {
    error((err as Error).message);
    return 2;
  }

  telemetry.trackCliOptionSince(parsedArgs.flags['--since']);
  telemetry.trackCliOptionUntil(parsedArgs.flags['--until']);
  telemetry.trackCliOptionFrom(fromFlag);
  telemetry.trackCliOptionTo(toFlag);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliFlagJson(parsedArgs.flags['--json']);
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
    const billing = owner?.billing;
    billingPeriod =
      billing?.subscriptions?.find(
        subscription =>
          subscription.frequency.interval === 'month' &&
          subscription.frequency.intervalCount === 1
      )?.period ?? billing?.period;
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

  const usingDefaults = !sinceFlag;
  const fromDate =
    sinceDate ??
    (billingPeriod
      ? new Date(billingPeriod.start).toISOString()
      : getDefaultFromDate());
  const toDate =
    untilDate ??
    (sinceFlag
      ? new Date().toISOString()
      : billingPeriod
        ? new Date(billingPeriod.end).toISOString()
        : getDefaultToDate());

  const fromDisplay =
    sinceFlag && !isRelativeTime(sinceFlag)
      ? sinceFlag
      : extractDatePortion(fromDate);
  const toDisplay =
    untilFlag && !isRelativeTime(untilFlag)
      ? untilFlag
      : extractDatePortion(toDate);
  debug(`Fetching dashboard usage from ${fromDate} to ${toDate}`);

  const start = Date.now();
  if (!asJson) {
    spinner(`Fetching usage data for ${chalk.bold(contextName)}`);
  }

  try {
    const query = new URLSearchParams();
    if (teamId) query.set('teamId', teamId);
    const viewPlan = getCostViews(groupByDimension);

    const queryString = query.toString();
    const costsRequest = client.fetch<CostMetricsResponse>(
      `/v2/billing/costs${queryString ? `?${queryString}` : ''}`,
      {
        method: 'POST',
        body: {
          from: fromDate,
          to: toDate,
          metrics: [GROSS_COST_METRIC, 'quantity'],
          format: 'timeseries',
          views: viewPlan.views,
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
      summaryView: response.results.views[viewPlan.summaryViewName],
      detailView: viewPlan.detailViewName
        ? response.results.views[viewPlan.detailViewName]
        : undefined,
      contextName,
      contextType,
      scope: parsedArgs.flags['--scope'],
      fromDisplay,
      toDisplay,
      usingDefaults,
      breakdownPeriod,
      groupByDimension,
    });
    attachCredit(usageData, commitmentUsage);

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
    if (
      isAPIError(err) &&
      err.status === 404 &&
      err.code === 'costs_not_found'
    ) {
      error(
        `Billing cost data is unavailable for ${fromDisplay} through ${toDisplay}. This does not mean usage was zero. It usually means the team has no active subscription for that range, or the range is before the team's billing data starts. Check that the selected team and date range are correct.`
      );
    } else {
      output.prettyError(err);
    }
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

function attachCredit(
  usageData: UsageData,
  commitmentUsage: CommitmentUsageResponse | null
): void {
  if (!commitmentUsage) return;
  const creditLedger = commitmentUsage.creditLedgers.find(
    ledger => ledger.currency === usageData.costUnit
  );
  if (!creditLedger) return;

  const used = roundToHundredths(creditLedger.total - creditLedger.remaining);
  // Active credit blocks can span billing cycles; never subtract this balance
  // from costs for the query period.
  usageData.creditBalance = {
    cadence: commitmentUsage.cadence,
    currency: creditLedger.currency,
    allocated: creditLedger.total,
    used,
    remaining: creditLedger.remaining,
  };
}

function processCosts(
  response: CostMetricsResponse,
  options: {
    summaryView?: CostMetricView;
    detailView?: CostMetricView;
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
    summaryView,
    detailView,
    contextName,
    contextType,
    scope,
    fromDisplay,
    toDisplay,
    usingDefaults,
    breakdownPeriod,
    groupByDimension,
  } = options;
  if (!summaryView) {
    throw new Error(
      'The billing API did not return the requested usage summary.'
    );
  }
  const costUnit = getCostUnit(response);
  if (response.availableCurrencies?.some(currency => currency !== costUnit)) {
    throw new Error(
      "Can't show complete costs for this date range because some costs use a different billing currency. Choose a date range within the current billing currency or view usage in the dashboard."
    );
  }
  const products = response.results.dimensionsMeta.product?.values ?? {};
  const projects = response.results.dimensionsMeta.project?.values ?? {};
  const regions = response.results.dimensionsMeta.region?.values ?? {};
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

  for (const result of summaryView?.results ?? []) {
    const product = result.dimensionValues.product;
    if (!product) continue;
    const productMetadata = products[product];
    const serviceName = productMetadata?.title ?? product;
    const aggregation = aggregateResult(
      result,
      product,
      serviceName,
      response.metrics,
      undefined,
      productMetadata?.category === 'Subscription Licenses'
    );
    addService(services, serviceName, aggregation);
    totalCost += aggregation.cost;

    if (breakdownPeriod) {
      for (let index = 0; index < response.results.times.length; index++) {
        const periodKey = getPeriodKey(
          response.results.times[index],
          breakdownPeriod
        );
        const period = periodUsage.get(periodKey) ?? emptyAggregation();
        const sample = aggregateResult(
          result,
          product,
          serviceName,
          response.metrics,
          index,
          productMetadata?.category === 'Subscription Licenses'
        );
        addService(period.services, serviceName, sample);
        period.totalCost += sample.cost;
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
        product,
        serviceName,
        response.metrics,
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
    costUnit,
    services,
    periodUsage,
    groupByUsage,
    totalCost,
  };
}

function getCostUnit(response: CostMetricsResponse): UsageData['costUnit'] {
  const unit = response.metrics.find(
    metric => metric.slug === GROSS_COST_METRIC
  )?.unit;
  return unit?.singular === 'MIU' || unit?.plural === 'MIUs'
    ? 'managed_infrastructure_units'
    : 'USD';
}

function aggregateResult(
  result: CostMetricGroup,
  product: string,
  name: string,
  metrics: CostMetric[],
  sampleIndex?: number,
  isSubscription = false
): ServiceAggregation {
  const grossCostIndex = result.metrics.indexOf(GROSS_COST_METRIC);
  const quantityIndex = result.metrics.findIndex(
    metric => metric !== GROSS_COST_METRIC
  );
  const quantityMetric = metrics.find(
    metric => metric.slug === result.metrics[quantityIndex]
  );
  const values =
    sampleIndex === undefined
      ? result.totalValue
      : (result.values[sampleIndex] ?? []);
  const cost = grossCostIndex === -1 ? 0 : (values[grossCostIndex] ?? 0);
  const included = result.flatRate === true;
  const rawQuantity = quantityIndex === -1 ? 0 : (values[quantityIndex] ?? 0);
  const quantity =
    isSubscription && sampleIndex === undefined && quantityIndex !== -1
      ? result.values.reduce(
          (maximum, sample) => Math.max(maximum, sample[quantityIndex] ?? 0),
          0
        )
      : rawQuantity;
  const units = getQuantityUnits(quantityMetric, product, isSubscription);

  return {
    name,
    product,
    quantity,
    ...units,
    cost,
    included,
    category: isSubscription ? 'subscription' : 'usage',
  };
}

function getQuantityUnits(
  metric: CostMetric | undefined,
  product: string,
  isSubscription: boolean
): Pick<ServiceAggregation, 'unit' | 'singularUnit' | 'unitKind'> {
  if (isSubscription) {
    return { unit: 'licenses', singularUnit: 'license' };
  }

  if (!metric?.unit) return {};
  if (metric.unit.kind === 'custom') {
    const singularUnit = metric.unit.singular;
    const unit = metric.unit.plural ?? singularUnit;
    if (!unit || singularUnit === metric.title || unit === metric.title)
      return {};
    return { unit, singularUnit };
  }

  if (metric.unit.kind === 'digitalStorage' && metric.unit.name) {
    return { unit: metric.unit.name, unitKind: metric.unit.kind };
  }

  const unit = metric.unit.name;
  if (!unit || unit === metric.title || unit === product) return {};
  return { unit, unitKind: metric.unit.kind };
}

function addService(
  services: Map<string, ServiceAggregation>,
  name: string,
  value: ServiceAggregation
): void {
  const key = JSON.stringify([value.product, value.included]);
  const existing = services.get(key);
  if (!existing) {
    services.set(key, { ...value, name });
    return;
  }
  const previousQuantity = existing.quantity;
  existing.quantity =
    existing.category === 'subscription'
      ? Math.max(previousQuantity, value.quantity)
      : previousQuantity + value.quantity;
  existing.cost += value.cost;
}

function emptyAggregation(): PeriodAggregation {
  return {
    services: new Map(),
    totalCost: 0,
  };
}
