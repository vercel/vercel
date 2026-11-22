import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import output from '../../../../src/output-manager';
import { outputAggregated } from '../../../../src/commands/usage/output-aggregated';
import { outputBreakdown } from '../../../../src/commands/usage/output-breakdown';
import { outputGroupBy } from '../../../../src/commands/usage/output-group-by';
import { outputJson } from '../../../../src/commands/usage/output-json';
import type Client from '../../../../src/util/client';
import {
  outputHiddenServicesHint,
  outputUsageHeader,
} from '../../../../src/commands/usage/output-utils';
import type {
  OutputOptions,
  ServiceAggregation,
  UsageData,
} from '../../../../src/commands/usage/types';

vi.mock('../../../../src/output-manager', () => ({
  default: { log: vi.fn(), print: vi.fn() },
}));

function createData(
  costUnit: UsageData['costUnit'] = 'USD',
  cost = 2
): UsageData {
  const service: ServiceAggregation = {
    name: 'Data Transfer',
    product: 'data-transfer',
    quantity: 0.001,
    unit: 'gigabyte',
    unitKind: 'digitalStorage',
    cost: 0,
    included: true,
    category: 'usage',
  };
  const services = new Map<string, ServiceAggregation>([
    ['Data Transfer', service],
    [
      'Paid Transfer',
      {
        ...service,
        name: 'Paid Transfer',
        quantity: -0.001,
        cost,
        included: false,
      },
    ],
    ['Unused Transfer', { ...service, name: 'Unused Transfer', quantity: 0 }],
  ]);
  const aggregation = { services, totalCost: cost };
  return {
    contextName: 'acme',
    contextType: 'team',
    fromDisplay: '2026-09-01T00:00:00Z',
    toDisplay: '2026-10-01T00:00:00Z',
    usageThrough: '2026-09-16T00:00:00Z',
    usingDefaults: true,
    costUnit,
    services,
    periodUsage: new Map([['2026-09-01', aggregation]]),
    groupByUsage: new Map([['my-project', aggregation]]),
    totalCost: cost,
  };
}

function loggedOutput(): string {
  return stripAnsi(
    vi
      .mocked(output.log)
      .mock.calls.map(([text]) => text)
      .join('\n')
  );
}

const originalChalkLevel = chalk.level;
beforeEach(() => {
  vi.clearAllMocks();
  chalk.level = 0;
});
afterEach(() => {
  chalk.level = originalChalkLevel;
});

describe('outputHiddenServicesHint', () => {
  it.each([
    [1, '1 service with no usage hidden. Add --json to include it.'],
    [59, '59 services with no usage hidden. Add --json to include them.'],
  ] as const)('offers JSON for %s hidden services', (count, expected) => {
    outputHiddenServicesHint(count);
    expect(loggedOutput()).toBe(expected);
    expect(output.log).toHaveBeenCalledTimes(1);
  });

  it('stays silent when no services are hidden', () => {
    outputHiddenServicesHint(0);
    expect(output.log).not.toHaveBeenCalled();
  });
});

describe('outputUsageHeader', () => {
  it.each([
    ['USD', 'USD'],
    ['managed_infrastructure_units', 'MIUs'],
  ] as const)('labels the cost unit for %s', (costUnit, label) => {
    outputUsageHeader(createData(costUnit), 'Usage', '[1s]');
    const text = loggedOutput();
    expect(text).toContain('Usage for team acme [1s]');
    expect(text).toContain('Billing cycle: Sep 1–Oct 1, 2026');
    expect(text.split('\n')).toContain(
      `Accrued through Sep 16, 2026 in ${label}, before credits and discounts.`
    );
    expect(text.match(/Accrued through/g)).toHaveLength(1);
    expect(text).not.toMatch(
      /Usage through:|Costs are accrued through this date|Before credits and discounts; not a final invoice\.|Cost unit:/
    );
    expect(text).not.toContain('managed_infrastructure_units');
    expect(text).not.toContain(`in ${label === 'USD' ? 'MIUs' : 'USD'},`);
  });

  it('labels the cost unit for a custom period', () => {
    outputUsageHeader({ ...createData(), usingDefaults: false }, 'Usage', '');
    expect(loggedOutput()).toContain('Period: Sep 1–Oct 1, 2026');
    expect(loggedOutput()).toContain(
      'Accrued through Sep 16, 2026 in USD, before credits and discounts.'
    );
    expect(loggedOutput()).not.toMatch(/Usage through:|Cost unit:/);
    expect(loggedOutput()).not.toContain('Billing cycle:');
  });
});

describe('credit balance presentation', () => {
  it.each([
    [20, 2.04, 17.96, '10%'],
    [1000, 250, 750, '25%'],
    [1000, 1000, 0, '100%'],
    [0, 0, 0, '0%'],
  ] as const)('calculates human progress from %s allocated and %s used', (allocated, used, remaining, percent) => {
    const data = createData();
    data.creditBalance = {
      currency: 'USD',
      cadence: 'monthly',
      allocated,
      used,
      remaining,
    };

    outputAggregated({ data, startTime: Date.now() });

    expect(loggedOutput()).toContain('Current credit balance');
    expect(loggedOutput()).toContain(`Progress   ${percent}`);
    expect(loggedOutput()).not.toMatch(/NaN|Infinity/);
    expect(data.creditBalance).not.toHaveProperty('progress');
    expect(data).not.toHaveProperty('credit');
  });

  it.each([
    ['USD', '<$0.01'],
    ['managed_infrastructure_units', '<0.01 MIUs'],
  ] as const)('shows a small remaining credit balance in %s', (costUnit, expected) => {
    const data = createData(costUnit);
    data.creditBalance = {
      currency: costUnit,
      allocated: 1.001,
      used: 1,
      remaining: 0.001,
    };

    outputAggregated({ data, startTime: Date.now() });

    expect(loggedOutput()).toContain(`Remaining  ${expected}`);
  });
});

const renderers: [
  string,
  (options: OutputOptions) => void,
  Partial<OutputOptions>,
][] = [
  ['aggregated usage', outputAggregated, {}],
  ['daily breakdown', outputBreakdown, { breakdownPeriod: 'daily' }],
  ['weekly breakdown', outputBreakdown, { breakdownPeriod: 'weekly' }],
  ['monthly breakdown', outputBreakdown, { breakdownPeriod: 'monthly' }],
  ['project grouping', outputGroupBy, { groupByDimension: 'project' }],
  ['region grouping', outputGroupBy, { groupByDimension: 'region' }],
];

const smallCostCases = [
  { costUnit: 'USD', amount: 0.0023, formatted: '<$0.01', zero: '$0.00' },
  { costUnit: 'USD', amount: -0.0023, formatted: '>-$0.01', zero: '$0.00' },
  {
    costUnit: 'managed_infrastructure_units',
    amount: 0.0023,
    formatted: '<0.01 MIUs',
    zero: '0 MIUs',
  },
  {
    costUnit: 'managed_infrastructure_units',
    amount: -0.0023,
    formatted: '>-0.01 MIUs',
    zero: '0 MIUs',
  },
] as const;

describe.each(renderers)('%s JSON contract', (_name, _render, options) => {
  it.each([
    'USD',
    'managed_infrastructure_units',
  ] as const)('serializes raw costs and credit balances in %s', costUnit => {
    const data = createData(costUnit);
    data.creditBalance = {
      currency: costUnit,
      allocated: 20,
      used: 2.04,
      remaining: 17.96,
    };
    const write = vi.fn();
    const client = { stdout: { write } } as unknown as Client;

    outputJson(client, {
      data,
      fromDate: data.fromDisplay,
      toDate: data.toDisplay,
      ...options,
    });

    expect(write).toHaveBeenCalledTimes(1);
    const text = write.mock.calls[0][0] as string;
    const json = JSON.parse(text);
    expect(text).toBe(`${JSON.stringify(json, null, 2)}\n`);
    expect(text).toBe(stripAnsi(text));
    expect(text).not.toMatch(
      /"(?:schemaVersion|effectiveCost|credit|progress|pricingQuantity|pricingUnit|billedCost|chargeCount)"\s*:/
    );
    expect(json.costUnit).toBe(costUnit);
    expect(json.creditBalance).toEqual(data.creditBalance);
    expect(json.totals).toEqual({ cost: 2 });
    expect(json.services).toEqual([
      {
        name: 'Paid Transfer',
        product: 'data-transfer',
        quantity: -0.001,
        unit: 'gigabyte',
        cost: 2,
        included: false,
        category: 'usage',
      },
      {
        name: 'Data Transfer',
        product: 'data-transfer',
        quantity: 0.001,
        unit: 'gigabyte',
        cost: 0,
        included: true,
        category: 'usage',
      },
      {
        name: 'Unused Transfer',
        product: 'data-transfer',
        quantity: 0,
        unit: 'gigabyte',
        cost: 0,
        included: true,
        category: 'usage',
      },
    ]);
    if (options.breakdownPeriod) {
      expect(json.breakdown).toEqual({
        period: options.breakdownPeriod,
        data: [
          {
            periodKey: '2026-09-01',
            services: json.services,
            totals: json.totals,
          },
        ],
      });
    } else {
      expect(json).not.toHaveProperty('breakdown');
    }
    if (options.groupByDimension) {
      expect(json.groupBy).toEqual({
        dimension: options.groupByDimension,
        data: [
          { name: 'my-project', services: json.services, totals: json.totals },
        ],
      });
    } else {
      expect(json).not.toHaveProperty('groupBy');
    }
    expect(output.print).not.toHaveBeenCalled();
    expect(output.log).not.toHaveBeenCalled();
  });

  it.each(smallCostCases)('preserves raw $costUnit cost $amount in JSON', ({
    costUnit,
    amount,
  }) => {
    const data = createData(costUnit, amount);
    const write = vi.fn();
    const client = { stdout: { write } } as unknown as Client;

    outputJson(client, {
      data,
      fromDate: data.fromDisplay,
      toDate: data.toDisplay,
      ...options,
    });

    expect(write).toHaveBeenCalledTimes(1);
    const text = write.mock.calls[0][0] as string;
    const json = JSON.parse(text);
    for (const aggregation of [
      json,
      ...(json.breakdown?.data ?? []),
      ...(json.groupBy?.data ?? []),
    ]) {
      expect(aggregation.totals).toEqual({ cost: amount });
      expect(aggregation.services).toContainEqual(
        expect.objectContaining({ name: 'Paid Transfer', cost: amount })
      );
    }
    expect(text).not.toMatch(/[<>]/);
    expect(output.print).not.toHaveBeenCalled();
    expect(output.log).not.toHaveBeenCalled();
  });
});

describe.each(renderers)('%s formatting', (_name, render, options) => {
  it.each(smallCostCases)('distinguishes $costUnit cost $amount from zero', ({
    costUnit,
    amount,
    formatted,
    zero,
  }) => {
    render({
      data: createData(costUnit, amount),
      startTime: Date.now(),
      ...options,
    });
    const text = vi
      .mocked(output.print)
      .mock.calls.map(([text]) => text)
      .join('\n');
    const rows = text.split('\n');
    const paidRow = rows.find(row => row.includes('Paid Transfer'))?.trimEnd();
    const includedRow = rows
      .find(row => row.includes('Data Transfer (Flat Rate CDN)'))
      ?.trimEnd();

    expect(text).toBe(stripAnsi(text));
    expect(paidRow?.endsWith(formatted)).toBe(true);
    expect(paidRow?.endsWith(zero)).toBe(false);
    expect(includedRow?.endsWith('Included')).toBe(true);
    if (options.breakdownPeriod || options.groupByDimension) {
      expect(loggedOutput()).toContain(`(${formatted})`);
    } else {
      for (const label of [
        'Infrastructure subtotal',
        'Infrastructure usage',
        'Estimated total',
      ]) {
        expect(
          rows
            .find(row => row.includes(label))
            ?.trimEnd()
            .endsWith(formatted)
        ).toBe(true);
      }
    }
    if (options.groupByDimension) {
      expect(loggedOutput()).toContain(`Estimated total: ${formatted}`);
    }
  });

  it.each([
    'USD',
    'managed_infrastructure_units',
  ] as const)('renders included and tiny usage without color for %s', costUnit => {
    render({ data: createData(costUnit), startTime: Date.now(), ...options });
    const text = vi
      .mocked(output.print)
      .mock.calls.map(([text]) => text)
      .join('\n');
    expect(text).toBe(stripAnsi(text));
    expect(text).toContain('Data Transfer (Flat Rate CDN)');
    expect(text).toContain('Paid Transfer');
    expect(text).not.toContain('Paid Transfer (Flat Rate CDN)');
    expect(text).toContain('<0.01 GB');
    expect(text).toContain('>-0.01 GB');
    expect(text).not.toMatch(/\s-?0 GB/);
    expect(text).not.toContain('Unused Transfer');
    expect(loggedOutput()).toContain(
      '1 service with no usage hidden. Add --json to include it.'
    );
    expect(loggedOutput()).toContain(
      `Accrued through Sep 16, 2026 in ${costUnit === 'USD' ? 'USD' : 'MIUs'}, before credits and discounts.`
    );
    const headers = text
      .split('\n')
      .filter(line => /\bService\s+Usage\b/.test(line));
    expect(headers).toHaveLength(1);
    expect(headers[0].trim().split(/\s{2,}/)).toEqual([
      'Service',
      'Usage',
      'Cost',
    ]);
    expect(`${text}\n${loggedOutput()}`).not.toMatch(
      /Estimated bill|Accrued cost|Effective Cost|Usage through:|Cost unit:|Costs are accrued through this date|Before credits and discounts; not a final invoice\./
    );
    if (options.groupByDimension) {
      expect(loggedOutput()).toContain(
        `Estimated total: ${costUnit === 'USD' ? '$2.00' : '2 MIUs'}`
      );
    } else if (!options.breakdownPeriod) {
      expect(text).toMatch(
        costUnit === 'USD'
          ? /Estimated total\s+\$2\.00/
          : /Estimated total\s+2 MIUs/
      );
    }
    expect(text).toContain(costUnit === 'USD' ? '$2.00' : '2 MIUs');
    if (costUnit !== 'USD') expect(text).not.toContain('$');
  });
});
