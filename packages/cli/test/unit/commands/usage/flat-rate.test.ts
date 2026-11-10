import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import usage from '../../../../src/commands/usage';
import type { CostMetricGroup } from '../../../../src/commands/usage/types';
import { costsFixture, useBillingCosts } from './billing-costs-mock';

const dates = ['--since', '2025-12-01', '--until', '2026-02-28'];
const modes = [
  { name: 'aggregate', args: [] },
  { name: 'daily', args: ['--breakdown', 'daily'] },
  { name: 'weekly', args: ['--breakdown', 'weekly'] },
  { name: 'monthly', args: ['--breakdown', 'monthly'] },
  { name: 'project', args: ['--group-by', 'project'] },
  { name: 'region', args: ['--group-by', 'region'] },
];

function fixture() {
  const data = costsFixture();
  data.results.times = [
    '2025-12-01T08:00:00.000Z',
    '2026-01-01T08:00:00.000Z',
    '2026-02-01T08:00:00.000Z',
  ];
  data.results.dimensionsMeta.product!.values!.cdnTier = {
    title: 'Flat Rate CDN 10M',
    category: 'Subscription Licenses',
  };
  data.results.dimensionsMeta.product!.values!.otherEdge = {
    title: 'Edge Requests',
    category: 'Delivery',
  };
  const metered: CostMetricGroup = {
    dimensionValues: { product: 'edge' },
    metrics: ['gross_cost', 'edge_requests'],
    values: [
      [2, 20],
      [0, 0],
      [0, 0],
    ],
    totalValue: [2, 20],
    flatRate: false,
  };
  const tier: CostMetricGroup = {
    dimensionValues: { product: 'cdnTier' },
    metrics: ['gross_cost', 'developer_seats'],
    values: [
      [10, 1],
      [10, 1],
      [10, 1],
    ],
    totalValue: [30, 3],
  };
  const other: CostMetricGroup = {
    ...metered,
    dimensionValues: { product: 'otherEdge' },
    values: [
      [0, 7],
      [0, 0],
      [0, 0],
    ],
    totalValue: [0, 7],
    flatRate: undefined,
  };
  const included = data.results.views.byProductRegionProject.results[2];
  data.results.views.byProduct.results = [
    metered,
    tier,
    other,
    { ...included, dimensionValues: { product: 'edge' } },
  ];
  data.results.views.byProductRegionProject.results = [
    ...[metered, tier, other].map(row => ({
      ...row,
      dimensionValues: {
        ...row.dimensionValues,
        project: 'prj_web',
        region: 'iad1',
      },
    })),
    {
      ...included,
      values: [
        [0, 100],
        [0, 200],
        [0, 0],
      ],
      totalValue: [0, 300],
    },
    {
      ...included,
      dimensionValues: {
        product: 'edge',
        project: 'prj_other',
        region: 'sfo1',
      },
      values: [
        [0, 300],
        [0, 300],
        [0, 0],
      ],
      totalValue: [0, 600],
    },
  ];
  return data;
}

describe('flat-rate usage', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    client.config.currentTeam = 'team_dummy';
  });

  it.each(
    modes
  )('keeps product and inclusion identities separate in $name JSON', async ({
    args,
  }) => {
    const requests = useBillingCosts(fixture());
    client.setArgv('usage', ...dates, ...args, '--json');
    expect(await usage(client)).toBe(0);
    expect(Object.keys(requests[0].views)).toEqual(
      args[0] === '--group-by'
        ? ['byProductRegionProject', 'byProduct']
        : ['byProduct']
    );
    const stdout = client.stdout.getFullOutput();
    const data = JSON.parse(stdout);
    expect(client.stderr.getFullOutput()).toBe('');
    expect(stdout).not.toContain('\u001b');
    expect(data.services).toHaveLength(4);
    expect(data.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product: 'edge',
          name: 'Edge Requests',
          included: false,
          quantity: 20,
          cost: 2,
        }),
        expect.objectContaining({
          product: 'edge',
          name: 'Edge Requests',
          included: true,
          quantity: 900,
          cost: 0,
        }),
        expect.objectContaining({
          product: 'otherEdge',
          included: false,
          quantity: 7,
          cost: 0,
        }),
        expect.objectContaining({
          product: 'cdnTier',
          category: 'subscription',
          included: false,
          quantity: 1,
          cost: 30,
        }),
      ])
    );
    expect(data.totals).toEqual({ cost: 32 });
    const sections = data.breakdown?.data ?? data.groupBy?.data;
    if (sections) {
      expect(
        sections.reduce(
          (sum: number, section: typeof data) => sum + section.totals.cost,
          0
        )
      ).toBe(32);
      const included = sections
        .flatMap((section: typeof data) => section.services)
        .filter((row: typeof data) => row.product === 'edge' && row.included);
      expect(
        included.reduce(
          (sum: number, row: typeof data) => sum + row.quantity,
          0
        )
      ).toBe(900);
      if (args[1] === 'monthly') {
        expect(
          sections.map((section: typeof data) => section.periodKey)
        ).toEqual(['2025-12', '2026-01', '2026-02']);
        expect(included.map((row: typeof data) => row.quantity)).toEqual([
          400, 500, 0,
        ]);
      }
    }
  });

  it.each(
    modes
  )('labels only flat-rate rows as Included in $name human output', async ({
    args,
  }) => {
    useBillingCosts(fixture());
    client.setArgv('usage', ...dates, ...args);
    expect(await usage(client)).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toMatch(
      /Edge Requests \(Flat Rate CDN\)\s+[^\n]+\s+Included/
    );
    expect(output).toMatch(/Edge Requests\s+20 requests\s+\$2\.00/);
    expect(output).toMatch(/Edge Requests\s+7 requests\s+\$0\.00/);
    expect(output).toContain('Flat Rate CDN 10M');
    expect(output).not.toContain('(included)');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('does not double-count included usage returned in both summary and detail', async () => {
    const data = fixture();
    useBillingCosts(data);
    client.setArgv('usage', ...dates, '--group-by', 'project', '--json');
    expect(await usage(client)).toBe(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(
      json.services.find((row: { included: boolean }) => row.included).quantity
    ).toBe(900);
    expect(
      json.groupBy.data.reduce(
        (total: number, section: typeof json) =>
          total +
          section.services.find((row: { included: boolean }) => row.included)
            .quantity,
        0
      )
    ).toBe(900);
  });

  it('shows included summary usage without requesting detail', async () => {
    const data = fixture();
    delete data.results.views.byProductRegionProject;
    useBillingCosts(data);
    client.setArgv('usage', ...dates, '--json');
    expect(await usage(client)).toBe(0);
    const json = JSON.parse(client.stdout.getFullOutput());
    expect(
      json.services.find((row: { included: boolean }) => row.included).quantity
    ).toBe(900);
    expect(client.stderr.getFullOutput()).toBe('');
  });
});
