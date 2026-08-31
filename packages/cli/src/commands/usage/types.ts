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
  unit: MetricUnit;
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
  quantity: number;
  unit: string;
  cost: number;
  included: boolean;
  category: 'usage' | 'subscription';
  // Kept for backwards-compatible JSON output.
  pricingQuantity: number;
  pricingUnit: string;
  effectiveCost: number;
  billedCost: number;
}

export interface PeriodAggregation {
  services: Map<string, ServiceAggregation>;
  totalCost: number;
  // Kept for backwards-compatible JSON output.
  totalPricingQuantity: number;
  totalEffectiveCost: number;
  totalBilledCost: number;
}

export interface GroupAggregation {
  services: Map<string, ServiceAggregation>;
  totalCost: number;
  // Kept for backwards-compatible JSON output.
  totalPricingQuantity: number;
  totalEffectiveCost: number;
  totalBilledCost: number;
}

export interface UsageData {
  contextName: string;
  fromDisplay: string;
  toDisplay: string;
  usingDefaults: boolean;
  chargeCount: number;
  services: Map<string, ServiceAggregation>;
  periodUsage: Map<string, PeriodAggregation>;
  groupByUsage: Map<string, GroupAggregation>;
  totalCost: number;
  grandTotals: {
    // Kept for backwards-compatible JSON output.
    pricingQuantity: number;
    effectiveCost: number;
    billedCost: number;
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
