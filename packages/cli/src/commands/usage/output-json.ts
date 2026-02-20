import type Client from '../../util/client';
import type { JsonOutputOptions } from './types';

export function outputJson(
  client: Client,
  { data, fromDate, toDate, breakdownPeriod }: JsonOutputOptions
): void {
  const sortedServices = [...data.services.entries()].sort(
    (a, b) => b[1].billedCost - a[1].billedCost
  );

  const sortedPeriods = [...data.periodUsage.keys()].sort();

  const jsonOutput: Record<string, unknown> = {
    period: {
      from: fromDate,
      to: toDate,
    },
    context: data.contextName,
    pricingUnit: data.pricingUnit,
  };

  // Include breakdown data if a breakdown period is specified
  if (breakdownPeriod) {
    jsonOutput.breakdown = {
      period: breakdownPeriod,
      data: sortedPeriods.map(periodKey => {
        const periodData = data.periodUsage.get(periodKey)!;
        const sortedPeriodServices = [...periodData.services.entries()].sort(
          (a, b) => b[1].billedCost - a[1].billedCost
        );
        return {
          periodKey,
          services: sortedPeriodServices.map(([name, svc]) => ({
            name,
            pricingQuantity: svc.pricingQuantity,
            pricingUnit: svc.pricingUnit,
            effectiveCost: svc.effectiveCost,
            billedCost: svc.billedCost,
          })),
          totals: {
            pricingQuantity: periodData.totalPricingQuantity,
            effectiveCost: periodData.totalEffectiveCost,
            billedCost: periodData.totalBilledCost,
          },
        };
      }),
    };
  }

  jsonOutput.services = sortedServices.map(([name, svc]) => ({
    name,
    pricingQuantity: svc.pricingQuantity,
    pricingUnit: svc.pricingUnit,
    effectiveCost: svc.effectiveCost,
    billedCost: svc.billedCost,
  }));

  jsonOutput.totals = {
    pricingQuantity: data.grandTotals.pricingQuantity,
    effectiveCost: data.grandTotals.effectiveCost,
    billedCost: data.grandTotals.billedCost,
  };

  jsonOutput.chargeCount = data.chargeCount;

  client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
}
