import { client } from '../../../mocks/client';
import type { FocusCharge } from '../../../../src/util/billing/focus-charge';
import type {
  CostMetricsResponse,
  UsageData,
} from '../../../../src/commands/usage/types';

const from = '2025-12-01T08:00:00.000Z';
const to = '2026-01-01T08:00:00.000Z';

type CostsRequest = {
  from: string;
  to: string;
  metrics: string[];
  format: string;
  views: Record<string, { groupBy: string[] }>;
  userAgent: string;
};

type OnRequest = (request: { body: CostsRequest; query: unknown }) => void;

export function useBillingCosts(
  fixture: CostMetricsResponse,
  onRequest?: OnRequest
) {
  const requests: CostsRequest[] = [];
  client.scenario.post('/v2/billing/costs', (req, res) => {
    const body = req.body as CostsRequest;
    requests.push(body);
    onRequest?.({ body, query: req.query });
    const response = structuredClone(fixture);
    response.results.views = {};
    // Model the legacy join: only the first requested view gets attribution.
    // A summary-first request consumes it even though it groups only by product.
    for (const [index, name] of Object.keys(body.views).entries()) {
      const view = fixture.results.views[name];
      if (!view) continue;
      response.results.views[name] = {
        ...view,
        results: view.results.map(result => ({
          ...result,
          dimensionValues: Object.fromEntries(
            Object.entries(result.dimensionValues).map(([dimension, value]) => [
              dimension,
              index > 0 && (dimension === 'project' || dimension === 'region')
                ? null
                : value,
            ])
          ),
        })),
      };
    }
    res.json(response);
  });
  return requests;
}

// Direct costs API fixture: each product has ONE result spanning three samples.
// In particular, totalValue sums license samples, but licenses are a gauge.
export function costsFixture(
  costUnit: UsageData['costUnit'] = 'USD'
): CostMetricsResponse {
  const fixture: CostMetricsResponse = {
    from,
    to,
    queriedAt: '2025-12-15T12:00:00.000Z',
    availableCurrencies: [costUnit],
    metrics: [
      {
        slug: 'gross_cost',
        title: 'Cost',
        unit:
          costUnit === 'USD'
            ? { kind: 'custom', singular: 'dollar', plural: 'dollars' }
            : { kind: 'custom', singular: 'MIU', plural: 'MIUs' },
      },
      { slug: 'developer_seats', title: 'Developer seats', unit: null },
      {
        slug: 'function_invocations',
        title: 'Function Invocations',
        unit: { kind: 'custom', singular: 'invocation', plural: 'invocations' },
      },
      {
        slug: 'edge_requests',
        title: 'Edge Requests',
        unit: { kind: 'custom', singular: 'request', plural: 'requests' },
      },
    ],
    results: {
      granularity: { unit: 'day', step: 1 },
      times: [from, '2025-12-02T08:00:00.000Z', '2025-12-03T08:00:00.000Z'],
      dimensionsMeta: {
        product: {
          values: {
            seats: {
              title: 'Developer seats',
              category: 'Subscription Licenses',
            },
            functions: {
              title: 'Function Invocations',
              category: 'Vercel Functions',
            },
            edge: { title: 'Edge Requests', category: 'Delivery' },
          },
        },
        project: { values: { prj_web: { title: 'web-app' } } },
        region: { values: { iad1: { title: 'Washington, D.C., USA' } } },
      },
      views: {
        byProduct: {
          groupBy: ['product'],
          results: [
            {
              dimensionValues: { product: 'seats' },
              metrics: ['gross_cost', 'developer_seats'],
              values: [
                [20, 1],
                [40, 3],
                [0, 2],
              ],
              totalValue: [60, 6],
            },
            {
              dimensionValues: { product: 'functions' },
              metrics: ['gross_cost', 'function_invocations'],
              values: [
                [1, 100],
                [2, 200],
                [0, 0],
              ],
              totalValue: [3, 300],
            },
            {
              dimensionValues: { product: 'edge' },
              metrics: ['gross_cost', 'edge_requests'],
              values: [
                [0, 400],
                [0, 500],
                [0, 0],
              ],
              totalValue: [0, 900],
              flatRate: true,
            },
          ],
        },
      },
    },
  };
  fixture.results.views.byProductRegionProject = {
    groupBy: ['product', 'region', 'project'],
    results: fixture.results.views.byProduct.results.map(result => ({
      ...structuredClone(result),
      dimensionValues: {
        ...result.dimensionValues,
        project: 'prj_web',
        region: 'iad1',
      },
    })),
  };
  return fixture;
}

export function createMockCharge(
  overrides: Partial<FocusCharge> = {}
): FocusCharge {
  return {
    ServiceName: 'Serverless Function Execution',
    PricingQuantity: 100,
    PricingUnit: 'MIUs',
    PricingCategory: 'Committed',
    PricingCurrency: 'USD',
    EffectiveCost: 0,
    BilledCost: 0,
    ChargePeriodStart: '2025-12-01T08:00:00.000Z',
    ChargePeriodEnd: '2025-12-02T08:00:00.000Z',
    ConsumedQuantity: 1000000,
    ConsumedUnit: 'GB-Seconds',
    ChargeCategory: 'Usage',
    BillingCurrency: 'USD',
    RegionId: 'iad1',
    RegionName: 'Washington, D.C., USA',
    ServiceCategory: 'Compute',
    ServiceProviderName: 'Vercel',
    Tags: {},
    ...overrides,
  };
}

// Adapt existing charge-shaped scenarios to the same costs API mock used by the
// direct multi-sample fixture. Quantities and costs come from the API metrics.
export function useBillingCharges(
  charges: FocusCharge[] = [],
  quantityUnit: 'inferred' | 'none' = 'inferred',
  onRequest?: OnRequest,
  detailGroupBy = ['product', 'region', 'project'],
  costUnit: UsageData['costUnit'] = 'USD'
) {
  const products = Object.fromEntries(
    charges.map(charge => [
      charge.ServiceName,
      {
        title: charge.ServiceName,
        category:
          charge.Tags.Category === 'Subscription Licenses'
            ? 'Subscription Licenses'
            : 'Vercel Functions',
      },
    ])
  );
  const projects = Object.fromEntries(
    charges.flatMap(charge =>
      charge.Tags.ProjectId
        ? [[charge.Tags.ProjectId, { title: charge.Tags.ProjectName }]]
        : []
    )
  );
  const regions = Object.fromEntries(
    charges.flatMap(charge =>
      charge.RegionId ? [[charge.RegionId, { title: charge.RegionName }]] : []
    )
  );
  const times = [
    ...new Set(charges.map(charge => charge.ChargePeriodStart)),
  ].sort();
  const quantityMetricSlug = (charge: FocusCharge) =>
    `usage_${charge.ServiceName.replaceAll(' ', '_').toLowerCase()}`;
  const results = charges.map(charge => ({
    dimensionValues: {
      product: charge.ServiceName,
      project: charge.Tags.ProjectId ?? null,
      region: charge.RegionId ?? null,
    },
    metrics: ['gross_cost', quantityMetricSlug(charge)],
    values: times.map(time =>
      time === charge.ChargePeriodStart
        ? [charge.BilledCost, charge.ConsumedQuantity]
        : [0, 0]
    ),
    totalValue: [charge.BilledCost, charge.ConsumedQuantity],
    flatRate: charge.Tags.FlatRate === 'true',
  }));

  return useBillingCosts(
    {
      metrics: [
        {
          slug: 'gross_cost',
          title: 'Cost',
          unit:
            costUnit === 'USD'
              ? { kind: 'custom', singular: 'dollar', plural: 'dollars' }
              : { kind: 'custom', singular: 'MIU', plural: 'MIUs' },
        },
        ...charges.map(charge => ({
          slug: quantityMetricSlug(charge),
          title: charge.ServiceName,
          unit:
            quantityUnit === 'none' ||
            charge.Tags.Category === 'Subscription Licenses'
              ? null
              : charge.ConsumedUnit === 'byte'
                ? { kind: 'digitalStorage', name: 'byte' }
                : {
                    kind: 'custom',
                    singular: charge.ConsumedUnit.replace(/s$/, ''),
                    plural: charge.ConsumedUnit,
                  },
        })),
      ],
      from: times.at(0) ?? from,
      to,
      queriedAt: '2025-12-15T12:00:00.000Z',
      results: {
        granularity: { unit: 'day', step: 1 },
        times,
        dimensionsMeta: {
          product: { values: products },
          project: { values: projects },
          region: { values: regions },
        },
        views: {
          byProduct: {
            groupBy: ['product'],
            results: results.map(result => ({
              ...result,
              dimensionValues: { product: result.dimensionValues.product },
            })),
          },
          byProductRegionProject: { groupBy: detailGroupBy, results },
        },
      },
    },
    onRequest
  );
}
