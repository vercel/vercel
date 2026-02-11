export type BreakdownPeriod = 'daily' | 'weekly' | 'monthly';

export interface ServiceAggregation {
  pricingQuantity: number;
  effectiveCost: number;
  billedCost: number;
  pricingUnit: string;
}

export interface PeriodAggregation {
  services: Map<string, ServiceAggregation>;
  totalPricingQuantity: number;
  totalEffectiveCost: number;
  totalBilledCost: number;
}

export interface UsageData {
  contextName: string;
  fromDisplay: string;
  toDisplay: string;
  usingDefaults: boolean;
  pricingUnit: string;
  chargeCount: number;
  services: Map<string, ServiceAggregation>;
  periodUsage: Map<string, PeriodAggregation>;
  grandTotals: {
    pricingQuantity: number;
    effectiveCost: number;
    billedCost: number;
  };
}

export interface OutputOptions {
  data: UsageData;
  breakdownPeriod?: BreakdownPeriod;
  startTime: number;
}

export interface JsonOutputOptions {
  data: UsageData;
  fromDate: string;
  toDate: string;
  breakdownPeriod?: BreakdownPeriod;
}
