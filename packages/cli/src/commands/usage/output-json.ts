import type Client from '../../util/client';
import type { JsonOutputOptions, ServiceAggregation } from './types';

function serializeService(service: ServiceAggregation) {
  return {
    name: service.name,
    product: service.product,
    quantity: service.quantity,
    unit: service.unit,
    cost: service.cost,
    included: service.included,
    category: service.category,
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
    costUnit: data.costUnit,
  };

  if (data.creditBalance) {
    jsonOutput.creditBalance = data.creditBalance;
  }

  if (breakdownPeriod) {
    jsonOutput.breakdown = {
      period: breakdownPeriod,
      data: [...data.periodUsage.keys()].sort().map(periodKey => {
        const period = data.periodUsage.get(periodKey)!;
        return {
          periodKey,
          services: [...period.services.entries()]
            .sort((a, b) => b[1].cost - a[1].cost)
            .map(([, service]) => serializeService(service)),
          totals: {
            cost: period.totalCost,
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
            .map(([, service]) => serializeService(service)),
          totals: {
            cost: group.totalCost,
          },
        })),
    };
  }

  jsonOutput.services = sortedServices.map(([, service]) =>
    serializeService(service)
  );
  jsonOutput.totals = {
    cost: data.totalCost,
  };

  client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
}
