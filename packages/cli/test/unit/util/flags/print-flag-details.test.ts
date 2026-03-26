import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { printFlagEnvironmentDetails } from '../../../../src/util/flags/print-flag-details';
import type { Flag } from '../../../../src/util/flags/types';

vi.mock('../../../../src/output-manager', () => ({
  default: {
    log: vi.fn(),
    print: vi.fn(),
  },
}));

import output from '../../../../src/output-manager';

const testFlag: Flag = {
  id: 'flag_123',
  slug: 'my-feature',
  kind: 'string',
  state: 'active',
  variants: [
    { id: 'control', value: 'control', label: 'Control' },
    { id: 'variant-a', value: 'variant-a', label: 'Variant A' },
  ],
  environments: {
    production: {
      active: true,
      pausedOutcome: { type: 'variant', variantId: 'control' },
      fallthrough: {
        type: 'split',
        base: {
          type: 'entity',
          kind: 'user',
          attribute: 'userId',
        },
        weights: {
          control: 1,
          'variant-a': 3,
        },
        defaultVariantId: 'control',
      },
      rules: [
        {
          id: 'rule_1',
          conditions: [
            {
              lhs: { type: 'entity', kind: 'user', attribute: 'plan' },
              cmp: 'eq',
              rhs: 'pro',
            },
          ],
          outcome: {
            type: 'split',
            base: {
              type: 'entity',
              kind: 'user',
              attribute: 'userId',
            },
            weights: {
              control: 1,
              'variant-a': 3,
            },
            defaultVariantId: 'control',
          },
        },
      ],
    },
  },
  createdAt: 0,
  updatedAt: 0,
  createdBy: 'user_123',
  projectId: 'project_123',
  ownerId: 'team_123',
  revision: 1,
  seed: 1,
  typeName: 'flag',
};

describe('printFlagEnvironmentDetails', () => {
  beforeEach(() => {
    vi.mocked(output.print).mockClear();
    vi.mocked(output.log).mockClear();
  });

  it('shows split weights as normalized percentages', () => {
    printFlagEnvironmentDetails(testFlag);

    const printed = stripAnsi(
      vi
        .mocked(output.print)
        .mock.calls.map(([message]) => message)
        .join('')
    );

    expect(printed).toContain('production: custom');
    expect(printed).toContain('split (Control: 25%, Variant A: 75%)');
    expect(printed).toContain('Default split: Control: 25%, Variant A: 75%');
  });
});
