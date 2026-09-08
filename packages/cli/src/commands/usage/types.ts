export type BreakdownPeriod = 'daily' | 'weekly' | 'monthly';

export type GroupByDimension = 'project' | 'region';

export interface MetricUnit {
  kind: string;
  name?: string;
  singular?: string;
  plural?: string;
}

export interface CostMetric {
  slug: string;
  title: string;
  unit: MetricUnit | null;
}

export interface CostMetricGroup {
  dimensionValues: Record<string, string | null>;
  metrics: string[];
  values: number[][];
  totalValue: number[];
  flatRate?: boolean;
}

export interface CostMetricsResponse {
  metrics: CostMetric[];
  from: string;
  to: string;
  queriedAt: string;
  results: {
    granularity: {
      unit: 'hour' | 'day' | 'week' | 'month';
      step: number;
    };
    times: string[];
    dimensionsMeta: Record<
      string,
      | {
          values?: Record<string, { title?: string; category?: string }>;
        }
      | undefined
    >;
    views: Record<
      string,
      {
        groupBy: string[];
        results: CostMetricGroup[];
      }
    >;
  };
}

export interface ServiceAggregation {
  product: string;
  quantity: number;
  unit?: string;
  singularUnit?: string;
  unitKind?: string;
  cost: number;
  included: boolean;
  category: 'usage' | 'subscription';
  effectiveCost: number;
}

export interface Aggregation {
  services: Map<string, ServiceAggregation>;
  totalCost: number;
  totalEffectiveCost: number;
}

export type PeriodAggregation = Aggregation;

export type GroupAggregation = Aggregation;

export interface CreditSummary {
  cadence?: 'one_time' | 'annual' | 'monthly' | 'quarterly' | 'semi_annual';
  currency: string;
  allocated: number;
  used: number;
  remaining: number;
  progress: number;
}

export interface CommitmentUsageResponse {
  creditLedgers: Array<{
    currency: string;
    title: string;
    periodStart: string;
    periodEnd: string;
    total: number;
    remaining: number;
  }>;
  cadence?: CreditSummary['cadence'];
}

export interface UsageData {
  contextName: string;
  contextType: 'team' | 'personal account';
  scope?: string;
  fromDisplay: string;
  toDisplay: string;
  usageThrough: string;
  usingDefaults: boolean;
  costUnit: 'USD' | 'managed_infrastructure_units';
  credit?: CreditSummary;
  services: Map<string, ServiceAggregation>;
  periodUsage: Map<string, PeriodAggregation>;
  groupByUsage: Map<string, GroupAggregation>;
  totalCost: number;
  grandTotals: {
    effectiveCost: number;
  };
}

export interface OutputOptions {
  data: UsageData;
  breakdownPeriod?: BreakdownPeriod;
  groupByDimension?: GroupByDimension;
  startTime: number;
}

export interface JsonOutputOptions {
  data: UsageData;
  fromDate: string;
  toDate: string;
  breakdownPeriod?: BreakdownPeriod;
  groupByDimension?: GroupByDimension;
}
