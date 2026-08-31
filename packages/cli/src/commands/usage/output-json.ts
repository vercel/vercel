import type Client from '../../util/client';
import type { JsonOutputOptions, ServiceAggregation } from './types';

function serializeService(name: string, service: ServiceAggregation) {
  return {
    name,
    quantity: service.quantity,
    unit: service.unit,
    cost: service.cost,
    included: service.included,
    category: service.category,
    // Existing fields are retained for scripts consuming the current contract.
    pricingQuantity: service.pricingQuantity,
    pricingUnit: service.pricingUnit,
    effectiveCost: service.effectiveCost,
    billedCost: service.billedCost,
  };
}

export function outputJson(
  client: Client,
  {
    data,
    fromDate,
    toDate,
    breakdownPeriod,
    groupByDimension,
  }: JsonOutputOptions
): void {
  const sortedServices = [...data.services.entries()].sort(
    (a, b) => b[1].cost - a[1].cost
  );

  const jsonOutput: Record<string, unknown> = {
    period: { from: fromDate, to: toDate },
    context: data.contextName,
    pricingUnit: 'USD',
  };

  if (breakdownPeriod) {
    jsonOutput.breakdown = {
      period: breakdownPeriod,
      data: [...data.periodUsage.keys()].sort().map(periodKey => {
        const period = data.periodUsage.get(periodKey)!;
        return {
          periodKey,
          services: [...period.services.entries()]
            .sort((a, b) => b[1].cost - a[1].cost)
            .map(([name, service]) => serializeService(name, service)),
          totals: {
            cost: period.totalCost,
            pricingQuantity: period.totalPricingQuantity,
            effectiveCost: period.totalEffectiveCost,
            billedCost: period.totalBilledCost,
          },
        };
      }),
    };
  }

  if (groupByDimension) {
    jsonOutput.groupBy = {
      dimension: groupByDimension,
      data: [...data.groupByUsage.entries()]
        .sort((a, b) => b[1].totalCost - a[1].totalCost)
        .map(([name, group]) => ({
          name,
          services: [...group.services.entries()]
            .sort((a, b) => b[1].cost - a[1].cost)
            .map(([serviceName, service]) =>
              serializeService(serviceName, service)
            ),
          totals: {
            cost: group.totalCost,
            pricingQuantity: group.totalPricingQuantity,
            effectiveCost: group.totalEffectiveCost,
            billedCost: group.totalBilledCost,
          },
        })),
    };
  }

  jsonOutput.services = sortedServices.map(([name, service]) =>
    serializeService(name, service)
  );
  jsonOutput.totals = {
    cost: data.totalCost,
    pricingQuantity: data.grandTotals.pricingQuantity,
    effectiveCost: data.grandTotals.effectiveCost,
    billedCost: data.grandTotals.billedCost,
  };
  jsonOutput.chargeCount = data.chargeCount;

  client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
}
