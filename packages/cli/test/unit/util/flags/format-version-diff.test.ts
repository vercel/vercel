import { describe, expect, it } from 'vitest';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import {
  diffVersionData,
  formatVersionDataDiff,
} from '../../../../src/util/flags/format-version-diff';
import type {
  FlagEnvironmentConfig,
  FlagVersion,
} from '../../../../src/util/flags/types';
import { defaultFlags } from '../../../mocks/flags';

describe('formatVersionDataDiff', () => {
  it('renders a combined semantic diff', () => {
    const before = createVersionData();
    const after = createVersionData();

    before.description = 'Old checkout rollout';
    after.description = 'New checkout rollout';
    before.tags = ['checkout'];
    after.tags = ['checkout', 'experiment'];
    before.variants[1].label = 'Enabled';
    after.variants[1].label = 'On';
    after.variants.push({
      id: 'beta',
      value: 'beta',
      label: 'Beta',
    });

    before.environments.production.fallthrough = {
      type: 'variant',
      variantId: 'off',
    };
    after.environments.production.fallthrough = {
      type: 'variant',
      variantId: 'on',
    };
    before.environments.production.rules = [];
    after.environments.production.rules = [
      {
        id: 'rule_country',
        conditions: [
          {
            lhs: { type: 'entity', kind: 'user', attribute: 'country' },
            cmp: 'oneOf',
            rhs: {
              type: 'list',
              items: [{ value: 'DE' }, { value: 'FR' }, { value: 'ES' }],
            },
          },
        ],
        outcome: { type: 'variant', variantId: 'on' },
      },
    ];
    after.environments.production.targets = {
      on: {
        user: {
          id: [{ value: 'user_123', note: 'QA' }],
        },
      },
    };

    before.environments.preview.active = true;
    after.environments.preview.active = false;
    after.environments.preview.pausedOutcome = {
      type: 'variant',
      variantId: 'off',
    };

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  General
          Description
            - Old checkout rollout
            + New checkout rollout
          Tags
            + experiment
          Variants
            + Beta, id: beta, value: "beta"
            ~ On (on)
              Label
                - Enabled
                + On

        Production
          Fallthrough
            - Serve Off
            + Serve On
          Rules
            + rule_country
              → On
                if user.country is in
                   - DE
                   - FR
                   - ES
          Targeting
            + user.id: user_123 (QA) → On

        Preview
          Status
            - active
            + paused, serving Off"
    `);
  });

  it('renders general metadata changes', () => {
    const before = createVersionData();
    const after = createVersionData();

    before.state = 'active';
    after.state = 'archived';
    before.permanent = false;
    after.permanent = true;
    before.tags = ['checkout', 'legacy'];
    after.tags = ['checkout', 'experiment'];
    before.maintainerIds = ['user_old', 'user_shared'];
    after.maintainerIds = ['user_new', 'user_shared'];
    before.seed = 100;
    after.seed = 200;

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  General
          State
            - active
            + archived
          Permanent
            - false
            + true
          Tags
            - legacy
            + experiment
          Maintainers
            - user_old
            + user_new
          Seed
            - 100
            + 200"
    `);
  });

  it('does not render default permanent materialization as a change', () => {
    const before = createVersionData();
    const after = createVersionData();

    delete before.permanent;
    after.permanent = false;

    expect(diffVersionData(before, after)).toEqual([]);
    expect(render(before, after)).toEqual('');
  });

  it('renders variant removals and field changes', () => {
    const before = createVersionData();
    const after = createVersionData();

    before.variants = [
      { id: 'off', value: false, label: 'Off' },
      {
        id: 'on',
        value: true,
        label: 'Enabled',
        description: 'Old enabled variant',
      },
      { id: 'legacy', value: 'legacy', label: 'Legacy' },
    ];
    after.variants = [
      { id: 'off', value: false, label: 'Off' },
      {
        id: 'on',
        value: false,
        description: 'New disabled variant',
      },
    ];

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  General
          Variants
            - Legacy, id: legacy, value: "legacy"
            ~ Enabled (on)
              Value
                - true
                + false
              Label
                - Enabled
                + -
              Description
                - Old enabled variant
                + New disabled variant"
    `);
  });

  it('renders changes to variant order', () => {
    const before = createVersionData();
    const after = createVersionData();

    after.variants = [...after.variants].reverse();

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  General
          Variants
            Order
              - off → on
              + on → off"
    `);
  });

  it('renders rule removals and modifications', () => {
    const before = createVersionData();
    const after = createVersionData();

    before.environments.production.rules = [
      {
        id: 'rule_plan',
        conditions: [
          {
            lhs: { type: 'entity', kind: 'user', attribute: 'plan' },
            cmp: 'eq',
            rhs: 'pro',
          },
        ],
        outcome: { type: 'variant', variantId: 'off' },
      },
      {
        id: 'rule_legacy',
        conditions: [
          {
            lhs: { type: 'segment' },
            cmp: 'eq',
            rhs: 'legacy-users',
          },
        ],
        outcome: { type: 'variant', variantId: 'on' },
      },
    ];
    after.environments.production.rules = [
      {
        id: 'rule_plan',
        conditions: [
          {
            lhs: { type: 'entity', kind: 'user', attribute: 'plan' },
            cmp: 'eq',
            rhs: 'enterprise',
          },
        ],
        outcome: { type: 'variant', variantId: 'on' },
      },
    ];

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  Production
          Rules
            - rule_legacy (position 2)
              → On
                if segment is legacy-users
            ~ rule_plan
              Conditions
                - if user.plan is pro
                + if user.plan is enterprise
              Serve
                - Off
                + On"
    `);
  });

  it('renders changes to rule evaluation order', () => {
    const before = createVersionData();
    const after = createVersionData();
    const firstRule = {
      id: 'rule_first',
      conditions: [
        {
          lhs: { type: 'entity' as const, kind: 'user', attribute: 'plan' },
          cmp: 'eq',
          rhs: 'pro',
        },
      ],
      outcome: { type: 'variant' as const, variantId: 'on' },
    };
    const secondRule = {
      id: 'rule_second',
      conditions: [
        {
          lhs: { type: 'entity' as const, kind: 'user', attribute: 'country' },
          cmp: 'eq',
          rhs: 'DE',
        },
      ],
      outcome: { type: 'variant' as const, variantId: 'off' },
    };

    before.environments.production.rules = [firstRule, secondRule];
    after.environments.production.rules = [secondRule, firstRule];

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  Production
          Rules
            Order
              - rule_first → rule_second
              + rule_second → rule_first"
    `);
  });

  it('renders condition changes with inspect-style list bullets', () => {
    const before = createVersionData();
    const after = createVersionData();

    before.environments.production.rules = [
      {
        id: 'rule_attrs',
        conditions: [
          {
            lhs: { type: 'entity', kind: 'user', attribute: 'email' },
            cmp: 'ex',
          },
        ],
        outcome: { type: 'variant', variantId: 'on' },
      },
    ];
    after.environments.production.rules = [
      {
        id: 'rule_attrs',
        conditions: [
          {
            lhs: { type: 'entity', kind: 'user', attribute: 'country' },
            cmp: 'oneOf',
            rhs: {
              type: 'list',
              items: [{ value: 'DE' }, { value: 'FR' }],
            },
          },
        ],
        outcome: { type: 'variant', variantId: 'on' },
      },
    ];

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  Production
          Rules
            ~ rule_attrs
              Conditions
                - if user.email has any value
                + if user.country is in
                   - DE
                   - FR"
    `);
  });

  it('renders targets, reuse, and paused outcome changes', () => {
    const before = createVersionData();
    const after = createVersionData();

    before.environments.preview.reuse = {
      active: true,
      environment: 'production',
    };
    after.environments.preview.reuse = {
      active: false,
      environment: 'production',
    };
    before.environments.preview.targets = {
      off: {
        user: {
          id: [{ value: 'user_001' }],
        },
      },
    };
    after.environments.preview.targets = {
      on: {
        account: {
          id: [{ value: 'acct_123' }],
        },
      },
    };
    before.environments.development.active = false;
    before.environments.development.pausedOutcome = {
      type: 'variant',
      variantId: 'off',
    };
    after.environments.development.active = false;
    after.environments.development.pausedOutcome = {
      type: 'variant',
      variantId: 'on',
    };

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  Preview
          Reuse
            - reusing Production
            + none
          Targeting
            - user.id: user_001 → Off
            + account.id: acct_123 → On

        Development
          Status
            - paused, serving Off
            + paused, serving On
          Paused outcome
            - Serve Off
            + Serve On"
    `);
  });

  it('uses variant IDs when labels would make targets ambiguous', () => {
    const before = createVersionData();
    const after = createVersionData();

    before.variants.push({ id: 'also-on', value: true, label: 'On' });
    after.variants.push({ id: 'also-on', value: true, label: 'On' });
    before.environments.production.targets = {
      on: { user: { id: [{ value: 'user_001' }] } },
    };
    after.environments.production.targets = {
      'also-on': { user: { id: [{ value: 'user_001' }] } },
    };

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  Production
          Targeting
            - user.id: user_001 → On (on)
            + user.id: user_001 → On (also-on)"
    `);
  });

  it('renders environment summaries for reuse, paused, and configured additions', () => {
    const before = createVersionData();
    const after = createVersionData();

    after.environments['custom-paused'] = createEnvironment({
      active: false,
      pausedOutcome: { type: 'variant', variantId: 'on' },
    });
    after.environments['custom-reuse'] = createEnvironment({
      reuse: {
        active: true,
        environment: 'production',
      },
    });
    after.environments['custom-targeted'] = createEnvironment({
      rules: [
        {
          id: 'rule_target',
          conditions: [
            {
              lhs: { type: 'entity', kind: 'user', attribute: 'plan' },
              cmp: 'eq',
              rhs: 'pro',
            },
          ],
          outcome: { type: 'variant', variantId: 'on' },
        },
      ],
      targets: {
        on: {
          user: {
            id: [{ value: 'user_001' }],
          },
        },
      },
    });

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  Custom-paused
          + Environment added
            Status: paused, serving On
            Paused outcome: Serve On

        Custom-reuse
          + Environment added
            Status: active
            Reuse: reusing Production

        Custom-targeted
          + Environment added
            Status: active
            Fallthrough: Serve Off
            Rules: 1
            Targets: 1"
    `);
  });

  it('renders split and rollout outcomes', () => {
    const before = createVersionData();
    const after = createVersionData();

    before.environments.production.fallthrough = {
      type: 'split',
      base: { type: 'entity', kind: 'user', attribute: 'id' },
      weights: { off: 50_000, on: 50_000 },
      defaultVariantId: 'off',
    };
    after.environments.production.fallthrough = {
      type: 'rollout',
      base: { type: 'entity', kind: 'user', attribute: 'id' },
      startTimestamp: 0,
      rollFromVariantId: 'off',
      rollToVariantId: 'on',
      defaultVariantId: 'off',
      slots: [
        { promille: 5_000, durationMs: 60 * 60 * 1000 },
        { promille: 50_000, durationMs: 24 * 60 * 60 * 1000 },
      ],
    };

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  Production
          Fallthrough
            - Serve split (Off: 50%, On: 50%); by user.id; Fallback: Off
            + Serve Off -> On; 5% for 1 hour, 50% for 1 day; then 100%; Fallback: Off; by user.id; Starts: 1970-01-01T00:00:00.000Z"
    `);
  });

  it('renders split bucketing and fallback changes', () => {
    const before = createVersionData();
    const after = createVersionData();

    before.environments.production.fallthrough = {
      type: 'split',
      base: { type: 'entity', kind: 'user', attribute: 'id' },
      weights: { off: 50_000, on: 50_000 },
      defaultVariantId: 'off',
    };
    after.environments.production.fallthrough = {
      type: 'split',
      base: { type: 'entity', kind: 'account', attribute: 'id' },
      weights: { off: 50_000, on: 50_000 },
      defaultVariantId: 'on',
    };

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  Production
          Fallthrough
            - Serve split (Off: 50%, On: 50%); by user.id; Fallback: Off
            + Serve split (Off: 50%, On: 50%); by account.id; Fallback: On"
    `);
  });

  it('renders rollout bucketing and start changes', () => {
    const before = createVersionData();
    const after = createVersionData();
    const slots = [{ promille: 10_000, durationMs: 60 * 60 * 1000 }];

    before.environments.production.fallthrough = {
      type: 'rollout',
      base: { type: 'entity', kind: 'user', attribute: 'id' },
      startTimestamp: 0,
      rollFromVariantId: 'off',
      rollToVariantId: 'on',
      defaultVariantId: 'off',
      slots,
    };
    after.environments.production.fallthrough = {
      type: 'rollout',
      base: { type: 'entity', kind: 'account', attribute: 'id' },
      startTimestamp: 60 * 60 * 1000,
      rollFromVariantId: 'off',
      rollToVariantId: 'on',
      defaultVariantId: 'off',
      slots,
    };

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  Production
          Fallthrough
            - Serve Off -> On; 10% for 1 hour; then 100%; Fallback: Off; by user.id; Starts: 1970-01-01T00:00:00.000Z
            + Serve Off -> On; 10% for 1 hour; then 100%; Fallback: Off; by account.id; Starts: 1970-01-01T01:00:00.000Z"
    `);
  });

  it('uses variant IDs when labels would make outcomes ambiguous', () => {
    const before = createVersionData();
    const after = createVersionData();

    before.variants.push({ id: 'also-on', value: true, label: 'On' });
    after.variants.push({ id: 'also-on', value: true, label: 'On' });
    before.environments.production.fallthrough = {
      type: 'variant',
      variantId: 'on',
    };
    after.environments.production.fallthrough = {
      type: 'variant',
      variantId: 'also-on',
    };

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  Production
          Fallthrough
            - Serve On (on)
            + Serve On (also-on)"
    `);
  });

  it('renders environment additions and removals', () => {
    const before = createVersionData();
    const after = createVersionData();

    delete before.environments['custom-preview'];
    after.environments['custom-preview'] = createEnvironment({
      fallthrough: { type: 'variant', variantId: 'on' },
    });
    delete after.environments.development;

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  Development
          - Environment removed
            Status: active
            Fallthrough: Serve On

        Custom-preview
          + Environment added
            Status: active
            Fallthrough: Serve On"
    `);
  });

  it('tolerates legacy added and removed environments without rules', () => {
    const before = createVersionData();
    const after = createVersionData();
    const addedEnvironment = createEnvironment({
      fallthrough: { type: 'variant', variantId: 'on' },
    });

    delete (before.environments.development as Partial<FlagEnvironmentConfig>)
      .rules;
    delete (addedEnvironment as Partial<FlagEnvironmentConfig>).rules;
    after.environments['custom-preview'] = addedEnvironment;
    delete after.environments.development;

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  Development
          - Environment removed
            Status: active
            Fallthrough: Serve On

        Custom-preview
          + Environment added
            Status: active
            Fallthrough: Serve On"
    `);
  });

  it('falls back for unknown future fields without hiding them', () => {
    const before = createVersionData() as FlagVersion['data'] & {
      removedUnknown?: string;
      unknown?: { nested?: string };
    };
    const after = createVersionData() as FlagVersion['data'] & {
      addedUnknown?: string;
      unknown?: { nested?: string };
    };

    before.removedUnknown = 'removed';
    before.unknown = { nested: 'old' };
    after.addedUnknown = 'added';
    after.unknown = { nested: 'new' };
    (
      before.environments.production as FlagEnvironmentConfig & {
        sampling?: string;
      }
    ).sampling = 'low';
    (
      after.environments.production as FlagEnvironmentConfig & {
        sampling?: string;
      }
    ).sampling = 'high';

    expect(render(before, after)).toMatchInlineSnapshot(`
      "  Production
          Other
            sampling
              - low
              + high

        Other
          addedUnknown
            + added
          removedUnknown
            - removed
          unknown.nested
            - old
            + new"
    `);
  });

  it('omits environment revision metadata from structural diffs', () => {
    const before = createVersionData();
    const after = createVersionData();

    before.environments.production.revision = 1;
    after.environments.production.revision = 2;

    expect(diffVersionData(before, after)).toEqual([]);
    expect(render(before, after)).toEqual('');
  });

  it('adds subtle emphasis to semantic rule details', () => {
    const before = createVersionData();
    const after = createVersionData();
    const previousChalkLevel = chalk.level;

    before.environments.production.rules = [];
    after.environments.production.rules = [
      {
        id: 'rule_country',
        conditions: [
          {
            lhs: { type: 'entity', kind: 'user', attribute: 'country' },
            cmp: 'oneOf',
            rhs: {
              type: 'list',
              items: [{ value: 'DE' }, { value: 'FR' }],
            },
          },
        ],
        outcome: { type: 'variant', variantId: 'on' },
      },
    ];

    chalk.level = 1;
    try {
      const diff = formatVersionDataDiff(before, after);

      expect(diff).toContain(chalk.dim('→'));
      expect(diff).toContain(chalk.dim('if'));
      expect(diff).toContain(chalk.dim('is in'));
      expect(diff).toContain(`${chalk.dim('-')} DE`);
      expect(diff).toContain(`${chalk.dim('→')} ${chalk.bold('On')}`);
    } finally {
      chalk.level = previousChalkLevel;
    }
  });
});

function render(before: FlagVersion['data'], after: FlagVersion['data']) {
  return stripAnsi(formatVersionDataDiff(before, after)).trimEnd();
}

function createVersionData(): FlagVersion['data'] {
  return JSON.parse(
    JSON.stringify({
      description: defaultFlags[0].description,
      variants: defaultFlags[0].variants,
      environments: defaultFlags[0].environments,
      seed: defaultFlags[0].seed,
      state: defaultFlags[0].state,
      tags: defaultFlags[0].tags ?? [],
      maintainerIds: defaultFlags[0].maintainerIds ?? [],
      permanent: false,
    })
  );
}

function createEnvironment(
  overrides: Partial<FlagEnvironmentConfig> = {}
): FlagEnvironmentConfig {
  return {
    active: true,
    fallthrough: { type: 'variant', variantId: 'off' },
    pausedOutcome: { type: 'variant', variantId: 'off' },
    rules: [],
    ...overrides,
  };
}
