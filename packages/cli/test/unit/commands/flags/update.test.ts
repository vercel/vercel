import chalk from 'chalk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import flags from '../../../../src/commands/flags';
import type {
  Flag,
  FlagEnvironmentConfig,
  FlagRolloutOutcome,
  FlagSplitOutcome,
} from '../../../../src/util/flags/types';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { useFlags } from '../../../mocks/flags';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

type TestFlag = Flag & {
  etag?: string;
  ifMatch?: string;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function createVariantEnvironment(
  fallthroughVariantId: string,
  pausedOutcomeVariantId = fallthroughVariantId,
  extra: Partial<FlagEnvironmentConfig> = {}
): FlagEnvironmentConfig {
  return {
    active: true,
    fallthrough: { type: 'variant', variantId: fallthroughVariantId },
    pausedOutcome: { type: 'variant', variantId: pausedOutcomeVariantId },
    rules: [],
    ...extra,
  };
}

function createSplitOutcome(
  defaultVariantId: string,
  weights: Record<string, number>
): FlagSplitOutcome {
  return {
    type: 'split',
    base: {
      type: 'entity',
      kind: 'user',
      attribute: 'plan',
    },
    weights,
    defaultVariantId,
  };
}

function createRolloutOutcome(
  rollFromVariantId: string,
  rollToVariantId: string,
  defaultVariantId: string
): FlagRolloutOutcome {
  return {
    type: 'rollout',
    base: {
      type: 'entity',
      kind: 'user',
      attribute: 'plan',
    },
    startTimestamp: 1_700_000_000_000,
    rollFromVariantId,
    rollToVariantId,
    defaultVariantId,
    slots: [
      {
        durationMs: 60_000,
        promille: 500,
      },
    ],
  };
}

function createTestFlags(): TestFlag[] {
  return [
    {
      id: 'flag_bool123',
      slug: 'my-feature',
      description: 'My awesome feature flag',
      kind: 'boolean',
      state: 'active',
      variants: [
        { id: 'off', value: false, label: 'Off' },
        { id: 'on', value: true, label: 'On' },
      ],
      environments: {
        production: createVariantEnvironment('off'),
        preview: createVariantEnvironment('on', 'off'),
        development: createVariantEnvironment('on', 'off'),
      },
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 3600000,
      createdBy: 'user_123',
      projectId: 'vercel-flags-test',
      ownerId: 'team_dummy',
      revision: 1,
      seed: 12345,
      typeName: 'flag',
    },
    {
      id: 'flag_string456',
      slug: 'another-feature',
      description: 'Another feature flag',
      kind: 'string',
      state: 'active',
      variants: [
        { id: 'default', value: 'control', label: 'Control' },
        { id: 'variant-a', value: 'variant-a', label: 'Variant A' },
      ],
      environments: {
        production: createVariantEnvironment('default'),
        preview: createVariantEnvironment('default'),
        development: createVariantEnvironment('default'),
      },
      createdAt: Date.now() - 172800000,
      updatedAt: Date.now() - 7200000,
      createdBy: 'user_123',
      projectId: 'vercel-flags-test',
      ownerId: 'team_dummy',
      revision: 2,
      seed: 67890,
      typeName: 'flag',
    },
    {
      id: 'flag_number789',
      slug: 'bucket-size',
      description: 'A numeric feature flag',
      kind: 'number',
      state: 'active',
      variants: [
        { id: 'small', value: 10, label: 'Small' },
        { id: 'large', value: 20, label: 'Large' },
      ],
      environments: {
        production: createVariantEnvironment('small'),
        preview: createVariantEnvironment('small'),
        development: createVariantEnvironment('small'),
      },
      createdAt: Date.now() - 172800000,
      updatedAt: Date.now() - 7200000,
      createdBy: 'user_123',
      projectId: 'vercel-flags-test',
      ownerId: 'team_dummy',
      revision: 2,
      seed: 67890,
      typeName: 'flag',
    },
    {
      id: 'flag_json999',
      slug: 'layout-config',
      description: 'A JSON feature flag',
      kind: 'json',
      state: 'active',
      variants: [
        {
          id: 'light',
          value: { theme: 'light', sidebar: false },
          label: 'Light',
        },
        {
          id: 'dark',
          value: ['dark', 'compact'],
          label: 'Dark',
        },
      ],
      environments: {
        production: createVariantEnvironment('light'),
        preview: createVariantEnvironment('light'),
        development: createVariantEnvironment('light'),
      },
      createdAt: Date.now() - 172800000,
      updatedAt: Date.now() - 7200000,
      createdBy: 'user_123',
      projectId: 'vercel-flags-test',
      ownerId: 'team_dummy',
      revision: 2,
      seed: 67890,
      typeName: 'flag',
    },
  ];
}

function createMutableStringFlag(): TestFlag {
  return {
    id: 'flag_mutable001',
    slug: 'mutable-feature',
    description: 'A feature flag with removable variants',
    kind: 'string',
    state: 'active',
    variants: [
      { id: 'control-id', value: 'control', label: 'Control' },
      { id: 'treatment-id', value: 'treatment', label: 'Treatment' },
      { id: 'legacy-id', value: 'legacy', label: 'Legacy' },
    ],
    environments: {
      production: createVariantEnvironment('control-id'),
      preview: createVariantEnvironment('control-id'),
      development: createVariantEnvironment('control-id'),
    },
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 7200000,
    createdBy: 'user_123',
    projectId: 'vercel-flags-test',
    ownerId: 'team_dummy',
    revision: 3,
    seed: 54321,
    typeName: 'flag',
  };
}

function createReferenceFlag(): TestFlag {
  return {
    id: 'flag_references001',
    slug: 'reference-feature',
    description: 'A feature flag that references removable variants',
    kind: 'string',
    state: 'active',
    variants: [
      { id: 'keep-id', value: 'keep', label: 'Keep' },
      { id: 'remove-me', value: 'remove-me', label: 'Remove Me' },
      { id: 'split-default', value: 'split-default', label: 'Split Default' },
      { id: 'split-zero', value: 'split-zero', label: 'Split Zero' },
      { id: 'roll-from', value: 'roll-from', label: 'Roll From' },
      { id: 'roll-to', value: 'roll-to', label: 'Roll To' },
      { id: 'roll-default', value: 'roll-default', label: 'Roll Default' },
      { id: 'targeted', value: 'targeted', label: 'Targeted' },
    ],
    environments: {
      production: createVariantEnvironment('keep-id', 'keep-id', {
        rules: [
          {
            id: 'rule-production',
            conditions: [],
            outcome: { type: 'variant', variantId: 'keep-id' },
          },
        ],
      }),
      preview: createVariantEnvironment('keep-id', 'keep-id'),
      development: createVariantEnvironment('keep-id', 'keep-id'),
    },
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 7200000,
    createdBy: 'user_123',
    projectId: 'vercel-flags-test',
    ownerId: 'team_dummy',
    revision: 4,
    seed: 13579,
    typeName: 'flag',
  };
}

function setTTY(isTTY: boolean) {
  (client.stdin as any).isTTY = isTTY;
}

function makeNonInteractive() {
  setTTY(false);
}

describe('flags update', () => {
  const selectMock = vi.fn();
  const textMock = vi.fn();
  const confirmMock = vi.fn();
  let testFlags: TestFlag[];

  function getFlag(slug: string): TestFlag {
    const flag = testFlags.find(item => item.slug === slug);
    if (!flag) {
      throw new Error(`Missing test flag ${slug}`);
    }

    return flag;
  }

  beforeEach(() => {
    testFlags = createTestFlags();
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
    });
    useFlags(testFlags);
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
    client.input.select = selectMock;
    client.input.text = textMock;
    client.input.confirm = confirmMock;
    selectMock.mockReset();
    textMock.mockReset();
    confirmMock.mockReset();
    setTTY(true);
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('flags', 'update', '--help');
      const exitCodePromise = flags(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'flags:update',
        },
      ]);
    });
  });

  it('tracks update usage', async () => {
    makeNonInteractive();
    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'control',
      '--value',
      'welcome-back',
      '--label',
      'Welcome back'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:update',
        value: 'update',
      },
      {
        key: 'argument:flag',
        value: '[REDACTED]',
      },
      {
        key: 'option:variant',
        value: '[REDACTED]',
      },
      {
        key: 'option:value',
        value: '[REDACTED]',
      },
      {
        key: 'option:label',
        value: '[REDACTED]',
      },
    ]);
  });

  it('tracks the message option', async () => {
    makeNonInteractive();
    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'control',
      '--label',
      'Welcome back',
      '--message',
      'Rename control variant'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:update',
        value: 'update',
      },
      {
        key: 'argument:flag',
        value: '[REDACTED]',
      },
      {
        key: 'option:variant',
        value: '[REDACTED]',
      },
      {
        key: 'option:label',
        value: '[REDACTED]',
      },
      {
        key: 'option:message',
        value: '[REDACTED]',
      },
    ]);
  });

  describe('existing variant updates', () => {
    it('updates string variant values and labels', async () => {
      makeNonInteractive();
      client.setArgv(
        'flags',
        'update',
        testFlags[1].slug,
        '--variant',
        'control',
        '--value',
        'welcome-back',
        '--label',
        'Welcome back'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(testFlags[1].variants).toMatchObject([
        { id: 'default', value: 'welcome-back', label: 'Welcome back' },
        { id: 'variant-a', value: 'variant-a', label: 'Variant A' },
      ]);
      expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
        'Updated via CLI'
      );
      expect(client.stderr.getFullOutput()).toContain('has been updated');
      expect(client.stderr.getFullOutput()).toContain('Variant:');
    });

    it('stores literal equals signs in values set with --value', async () => {
      makeNonInteractive();
      client.setArgv(
        'flags',
        'update',
        testFlags[1].slug,
        '--variant',
        'control',
        '--value',
        'a=b'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(testFlags[1].variants).toMatchObject([
        { id: 'default', value: 'a=b', label: 'Control' },
        { id: 'variant-a', value: 'variant-a', label: 'Variant A' },
      ]);
    });

    it('sends the provided revision message', async () => {
      makeNonInteractive();
      client.setArgv(
        'flags',
        'update',
        testFlags[1].slug,
        '--variant',
        'control',
        '--label',
        'Welcome back',
        '--message',
        'Rename control variant'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
        'Rename control variant'
      );
    });

    it('updates number variants', async () => {
      makeNonInteractive();
      client.setArgv(
        'flags',
        'update',
        testFlags[2].slug,
        '--variant',
        'small',
        '--value',
        '15',
        '--label',
        'Medium'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(testFlags[2].variants).toMatchObject([
        { id: 'small', value: 15, label: 'Medium' },
        { id: 'large', value: 20, label: 'Large' },
      ]);
    });

    it('updates JSON variants by value', async () => {
      makeNonInteractive();
      client.setArgv(
        'flags',
        'update',
        testFlags[3].slug,
        '--variant',
        '{"theme":"light","sidebar":false}',
        '--value',
        '{"theme":"light","sidebar":true}',
        '--label',
        'Light+'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(testFlags[3].variants).toMatchObject([
        {
          id: 'light',
          value: { theme: 'light', sidebar: true },
          label: 'Light+',
        },
        { id: 'dark', value: ['dark', 'compact'], label: 'Dark' },
      ]);
    });

    it('rejects invalid JSON updates', async () => {
      makeNonInteractive();
      client.setArgv(
        'flags',
        'update',
        testFlags[3].slug,
        '--variant',
        'light',
        '--value',
        '{"theme":"light"'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'JSON variant values must be valid JSON'
      );
    });

    it('allows label-only boolean updates when the value stays the same', async () => {
      makeNonInteractive();
      client.setArgv(
        'flags',
        'update',
        testFlags[0].slug,
        '--variant',
        'false',
        '--label',
        'Disabled'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(testFlags[0].variants).toMatchObject([
        { id: 'off', value: false, label: 'Disabled' },
        { id: 'on', value: true, label: 'On' },
      ]);
    });

    it('rejects attempts to change boolean variant values', async () => {
      makeNonInteractive();
      client.setArgv(
        'flags',
        'update',
        testFlags[0].slug,
        '--variant',
        'false',
        '--value',
        'true',
        '--label',
        'Enabled'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Boolean variant values cannot be changed'
      );
    });

    it('does not resolve explicit selectors by label', async () => {
      makeNonInteractive();
      client.setArgv(
        'flags',
        'update',
        testFlags[1].slug,
        '--variant',
        'Control',
        '--value',
        'welcome-back',
        '--label',
        'Welcome back'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'You can specify a variant by its ID or value.'
      );
    });

    it('prompts for missing value and label when variant is provided', async () => {
      textMock
        .mockResolvedValueOnce('welcome-back')
        .mockResolvedValueOnce('Welcome back')
        .mockResolvedValueOnce('Rename control variant');

      client.setArgv(
        'flags',
        'update',
        testFlags[1].slug,
        '--variant',
        'control'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(selectMock).not.toHaveBeenCalled();
      expect(textMock).toHaveBeenCalledTimes(3);
      expect(textMock.mock.calls[0][0].message).toContain('Enter a new value');
      expect(textMock.mock.calls[1][0].message).toContain('Enter a new label');
      expect(textMock.mock.calls[2][0].message).toContain('Enter a message');
      expect(textMock.mock.calls[2][0].default).toEqual('Updated via CLI');
      expect(testFlags[1].variants[0]).toMatchObject({
        id: 'default',
        value: 'welcome-back',
        label: 'Welcome back',
      });
      expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
        'Rename control variant'
      );
    });

    it('returns a 412 failure when the flag changes after it is fetched', async () => {
      makeNonInteractive();
      testFlags[1].etag = '"test-etag-1"';
      testFlags[1].ifMatch = '"test-etag-2"';
      client.setArgv(
        'flags',
        'update',
        'another-feature',
        '--variant',
        'control',
        '--value',
        'new-value',
        '--label',
        'New'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Flag changed while updating; re-run the command.'
      );
      expect(testFlags[1].variants).toMatchObject([
        { id: 'default', value: 'control', label: 'Control' },
        { id: 'variant-a', value: 'variant-a', label: 'Variant A' },
      ]);
    });

    it('validates prompted values and allows empty input to keep the current value', async () => {
      textMock
        .mockResolvedValueOnce('') // value prompt: keep the current value
        .mockResolvedValueOnce(''); // label prompt: skip
      client.setArgv(
        'flags',
        'update',
        testFlags[3].slug,
        '--variant',
        'light'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(selectMock).not.toHaveBeenCalled();
      expect(client.stderr.getFullOutput()).toContain('already up to date');

      const validate = textMock.mock.calls[0][0].validate;
      expect(validate('')).toBe(true);
      expect(validate('   ')).toBe(true);
      expect(validate('{bad')).toEqual(
        'JSON variant values must be valid JSON'
      );
      expect(validate('{"ok":1}')).toBe(true);
    });

    it('skips the value prompt for boolean flags in interactive mode', async () => {
      textMock
        .mockResolvedValueOnce('Disabled') // label prompt
        .mockResolvedValueOnce(''); // message prompt: use default
      client.setArgv(
        'flags',
        'update',
        testFlags[0].slug,
        '--variant',
        'false'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(selectMock).not.toHaveBeenCalled();
      expect(textMock).toHaveBeenCalledTimes(2);
      expect(textMock.mock.calls[0][0].message).toContain('label');
      expect(testFlags[0].variants[0]).toMatchObject({
        id: 'off',
        value: false,
        label: 'Disabled',
      });
    });
  });

  describe('variant add/remove', () => {
    it.each([
      {
        slug: 'another-feature',
        option: ['--add-variant', 'treatment=Treatment'],
        expected: [
          { id: 'default', value: 'control', label: 'Control' },
          { id: 'variant-a', value: 'variant-a', label: 'Variant A' },
          { value: 'treatment', label: 'Treatment' },
        ],
      },
      {
        slug: 'bucket-size',
        option: ['--add-variant', '15=Medium'],
        expected: [
          { id: 'small', value: 10, label: 'Small' },
          { id: 'large', value: 20, label: 'Large' },
          { value: 15, label: 'Medium' },
        ],
      },
      {
        slug: 'layout-config',
        option: ['--add-variant', '{"theme":"dark","sidebar":true}=Dark+'],
        expected: [
          {
            id: 'light',
            value: { theme: 'light', sidebar: false },
            label: 'Light',
          },
          { id: 'dark', value: ['dark', 'compact'], label: 'Dark' },
          {
            value: { theme: 'dark', sidebar: true },
            label: 'Dark+',
          },
        ],
      },
    ])('adds variants with labels', async ({ slug, option, expected }) => {
      makeNonInteractive();
      client.setArgv('flags', 'update', slug, ...option);

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(getFlag(slug).variants).toMatchObject(expected);
    });

    it('removes JSON variants selected by a value containing equals signs', async () => {
      makeNonInteractive();
      testFlags[3].variants.push({
        id: 'query',
        value: { query: 'a=b' },
        label: 'Query',
      });
      client.setArgv(
        'flags',
        'update',
        'layout-config',
        '--remove-variant',
        '{"query":"a=b"}',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(getFlag('layout-config').variants).toMatchObject([
        {
          id: 'light',
          value: { theme: 'light', sidebar: false },
          label: 'Light',
        },
        { id: 'dark', value: ['dark', 'compact'], label: 'Dark' },
      ]);
    });

    it('supports repeatable adds', async () => {
      makeNonInteractive();
      client.setArgv(
        'flags',
        'update',
        'another-feature',
        '--add-variant',
        'beta=Beta',
        '--add-variant',
        'gamma=Gamma'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(getFlag('another-feature').variants).toMatchObject([
        { id: 'default', value: 'control', label: 'Control' },
        { id: 'variant-a', value: 'variant-a', label: 'Variant A' },
        { value: 'beta', label: 'Beta' },
        { value: 'gamma', label: 'Gamma' },
      ]);
    });

    it('removes unused variants by ID and value', async () => {
      makeNonInteractive();
      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--remove-variant',
        'treatment-id',
        '--remove-variant',
        'legacy',
        '--yes'
      );

      testFlags.push(createMutableStringFlag());
      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(getFlag('mutable-feature').variants).toMatchObject([
        { id: 'control-id', value: 'control', label: 'Control' },
      ]);
    });

    it('supports repeatable removes', async () => {
      makeNonInteractive();
      testFlags.push(createMutableStringFlag());
      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--remove-variant',
        'treatment-id',
        '--remove-variant',
        'legacy-id',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(getFlag('mutable-feature').variants).toMatchObject([
        { id: 'control-id', value: 'control', label: 'Control' },
      ]);
    });

    it('adds and removes variants in one command', async () => {
      makeNonInteractive();
      testFlags.push(createMutableStringFlag());
      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--add-variant',
        'new-value=New Value',
        '--remove-variant',
        'treatment-id',
        '--yes'
      );

      const originalEnvironments = clone(
        getFlag('mutable-feature').environments
      );
      const originalVariantIds = getFlag('mutable-feature').variants.map(
        variant => variant.id
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      const mutableFlag = getFlag('mutable-feature');
      expect(mutableFlag.variants).toHaveLength(3);
      expect(mutableFlag.variants[0].id).toEqual(originalVariantIds[0]);
      expect(mutableFlag.variants[1].id).toEqual(originalVariantIds[2]);
      expect(mutableFlag.environments).toEqual(originalEnvironments);
      expect(mutableFlag.variants).toMatchObject([
        { id: 'control-id', value: 'control', label: 'Control' },
        { id: 'legacy-id', value: 'legacy', label: 'Legacy' },
        { value: 'new-value', label: 'New Value' },
      ]);
      expect(client.stderr.getFullOutput()).toContain('has been updated');
      expect(client.stderr.getFullOutput()).toContain('Added:');
      expect(client.stderr.getFullOutput()).toContain('Removed:');
    });

    it('preserves existing variant IDs and environment config', async () => {
      makeNonInteractive();
      testFlags.push(createMutableStringFlag());
      const mutableFlag = getFlag('mutable-feature');
      const originalEnvironments = clone(mutableFlag.environments);
      const originalVariantIds = mutableFlag.variants.map(
        variant => variant.id
      );

      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--add-variant',
        'promo=Promo',
        '--remove-variant',
        'treatment-id',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      // The mock PATCH handler replaces the flag object in the list, so
      // re-fetch instead of asserting on the pre-update reference.
      const updatedFlag = getFlag('mutable-feature');
      expect(updatedFlag.variants[0].id).toEqual(originalVariantIds[0]);
      expect(updatedFlag.variants[1].id).toEqual(originalVariantIds[2]);
      expect(updatedFlag.environments).toEqual(originalEnvironments);
    });

    it('numbers default JSON labels using the post-removal variant count', async () => {
      makeNonInteractive();
      client.setArgv(
        'flags',
        'update',
        'layout-config',
        '--remove-variant',
        'dark',
        '--add-variant',
        '{"accent":"blue"}',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(getFlag('layout-config').variants).toMatchObject([
        {
          id: 'light',
          value: { theme: 'light', sidebar: false },
          label: 'Light',
        },
        { value: { accent: 'blue' }, label: 'Variant 2' },
      ]);
    });

    it.each([
      ['--add-variant', 'maybe=Maybe'],
      ['--remove-variant', 'off'],
    ])('rejects boolean %s operations', async (...args) => {
      makeNonInteractive();
      client.setArgv('flags', 'update', testFlags[0].slug, ...args);

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Boolean flags do not support --add-variant or --remove-variant.'
      );
    });

    it('rejects add and remove on archived flags', async () => {
      makeNonInteractive();
      const archivedFlag = createMutableStringFlag();
      archivedFlag.state = 'archived';
      testFlags.push(archivedFlag);
      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--add-variant',
        'x=X',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'is archived and cannot be updated'
      );
    });

    it('replaces a variant by removing and re-adding its value in one command', async () => {
      makeNonInteractive();
      testFlags.push(createMutableStringFlag());
      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--remove-variant',
        'treatment-id',
        '--add-variant',
        'treatment=New',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      const updatedFlag = getFlag('mutable-feature');
      expect(updatedFlag.variants).toMatchObject([
        { id: 'control-id', value: 'control', label: 'Control' },
        { id: 'legacy-id', value: 'legacy', label: 'Legacy' },
        { value: 'treatment', label: 'New' },
      ]);
      expect(updatedFlag.variants[2].id).not.toEqual('treatment-id');
    });

    it('rejects duplicate values across added variants', async () => {
      makeNonInteractive();
      client.setArgv(
        'flags',
        'update',
        'another-feature',
        '--add-variant',
        'x=A',
        '--add-variant',
        'x=B'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain('would be duplicated');
    });

    it.each([
      {
        slug: 'another-feature',
        option: ['--add-variant', '=Broken'],
        expected: 'Invalid variant "=Broken": Variant value cannot be empty',
      },
      {
        slug: 'bucket-size',
        option: ['--add-variant', 'not-a-number=Broken'],
        expected:
          'Invalid variant "not-a-number=Broken": Number variants must be valid numeric values',
      },
      {
        slug: 'layout-config',
        option: ['--add-variant', 'not-json'],
        expected:
          'Invalid variant "not-json": JSON variant values must be valid JSON',
      },
    ])('rejects invalid add values', async ({ slug, option, expected }) => {
      makeNonInteractive();
      client.setArgv('flags', 'update', slug, ...option);

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(expected);
    });

    it('rejects duplicate final values', async () => {
      makeNonInteractive();
      testFlags.push(createMutableStringFlag());
      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--add-variant',
        'control=Duplicate Control'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Variant value "control" would be duplicated'
      );
    });

    it('rejects missing variants', async () => {
      makeNonInteractive();
      testFlags.push(createMutableStringFlag());
      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--remove-variant',
        'missing-variant',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Variant "missing-variant" not found'
      );
    });

    it('rejects duplicate removals', async () => {
      makeNonInteractive();
      testFlags.push(createMutableStringFlag());
      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--remove-variant',
        'treatment-id',
        '--remove-variant',
        'treatment',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Duplicate --remove-variant selector'
      );
    });

    it.each([
      ['--variant', 'control', '--add-variant', 'treatment=Treatment'],
      ['--label', 'Updated', '--remove-variant', 'treatment-id'],
    ])('rejects invalid option mixes', async (...args) => {
      makeNonInteractive();
      client.setArgv('flags', 'update', 'another-feature', ...args);

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Cannot mix --variant, --value, or --label with --add-variant or --remove-variant.'
      );
    });

    it('prompts before removing variants', async () => {
      testFlags.push(createMutableStringFlag());
      confirmMock.mockResolvedValueOnce(true);
      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--remove-variant',
        'treatment-id'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(confirmMock).toHaveBeenCalledWith(
        expect.stringContaining('Remove 1 variant from mutable-feature?'),
        false
      );
      expect(getFlag('mutable-feature').variants).toMatchObject([
        { id: 'control-id', value: 'control', label: 'Control' },
        { id: 'legacy-id', value: 'legacy', label: 'Legacy' },
      ]);
    });

    it('aborts when removal is rejected', async () => {
      testFlags.push(createMutableStringFlag());
      confirmMock.mockResolvedValueOnce(false);
      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--remove-variant',
        'treatment-id'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(client.stderr.getFullOutput()).toContain('Aborted');
      expect(getFlag('mutable-feature').variants).toHaveLength(3);
    });

    it('skips the removal prompt with --yes', async () => {
      testFlags.push(createMutableStringFlag());
      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--remove-variant',
        'treatment-id',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(confirmMock).not.toHaveBeenCalled();
      expect(getFlag('mutable-feature').variants).toMatchObject([
        { id: 'control-id', value: 'control', label: 'Control' },
        { id: 'legacy-id', value: 'legacy', label: 'Legacy' },
      ]);
    });

    it('requires --yes in non-interactive mode when removing variants', async () => {
      makeNonInteractive();
      testFlags.push(createMutableStringFlag());
      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--remove-variant',
        'treatment-id'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Missing required flag --yes'
      );
    });

    it('tracks add/remove telemetry', async () => {
      makeNonInteractive();
      testFlags.push(createMutableStringFlag());
      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--add-variant',
        'promo=Promo',
        '--remove-variant',
        'treatment-id',
        '--message',
        'Promote the new value',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:update',
          value: 'update',
        },
        {
          key: 'argument:flag',
          value: '[REDACTED]',
        },
        {
          key: 'option:add-variant',
          value: '[REDACTED]',
        },
        {
          key: 'option:remove-variant',
          value: '[REDACTED]',
        },
        {
          key: 'option:message',
          value: '[REDACTED]',
        },
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
      expect(
        (getFlag('mutable-feature') as Flag & { message?: string }).message
      ).toEqual('Promote the new value');
    });

    it('returns a 412 failure when the flag changes after it is fetched', async () => {
      makeNonInteractive();
      testFlags.push(createMutableStringFlag());
      const mutableFlag = getFlag('mutable-feature');
      mutableFlag.etag = '"test-etag-1"';
      mutableFlag.ifMatch = '"test-etag-2"';
      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--remove-variant',
        'treatment-id',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Flag changed while updating; re-run the command.'
      );
      expect(getFlag('mutable-feature').variants).toHaveLength(3);
    });

    it('fails closed when the flag response has no ETag', async () => {
      makeNonInteractive();
      const mutableFlag = createMutableStringFlag();
      mutableFlag.etag = '';
      testFlags.push(mutableFlag);
      client.setArgv(
        'flags',
        'update',
        'mutable-feature',
        '--remove-variant',
        'treatment-id',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Unable to update flag safely'
      );
      expect(getFlag('mutable-feature').variants).toHaveLength(3);
    });

    it('reports missing flags without the ETag failure message', async () => {
      makeNonInteractive();
      client.setArgv(
        'flags',
        'update',
        'nonexistent-flag',
        '--add-variant',
        'x=X',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain('Flag not found');
      expect(client.stderr.getFullOutput()).not.toContain(
        'Unable to update flag safely'
      );
    });
  });

  describe('removal reference blocking', () => {
    it.each([
      {
        description: 'fallthrough',
        mutate: (flag: TestFlag) => {
          flag.environments.production.fallthrough = {
            type: 'variant',
            variantId: 'remove-me',
          };
        },
        selector: 'remove-me',
        expectedPath: 'production.fallthrough',
      },
      {
        description: 'pausedOutcome',
        mutate: (flag: TestFlag) => {
          flag.environments.production.pausedOutcome = {
            type: 'variant',
            variantId: 'remove-me',
          };
        },
        selector: 'remove-me',
        expectedPath: 'production.pausedOutcome',
      },
      {
        description: 'rule outcome',
        mutate: (flag: TestFlag) => {
          flag.environments.production.rules = [
            {
              id: 'rule-production',
              conditions: [],
              outcome: { type: 'variant', variantId: 'remove-me' },
            },
          ];
        },
        selector: 'remove-me',
        expectedPath: 'production.rules[0].outcome',
      },
      {
        description: 'split default',
        mutate: (flag: TestFlag) => {
          flag.environments.production.fallthrough = createSplitOutcome(
            'remove-me',
            {
              keep: 100,
            }
          );
        },
        selector: 'remove-me',
        expectedPath: 'production.fallthrough.default',
      },
      {
        description: 'split weights including 0',
        mutate: (flag: TestFlag) => {
          flag.environments.production.fallthrough = createSplitOutcome(
            'keep-id',
            {
              'remove-me': 0,
              keep: 100,
            }
          );
        },
        selector: 'remove-me',
        expectedPath: 'production.fallthrough.weights.remove-me',
      },
      {
        description: 'rollout from',
        mutate: (flag: TestFlag) => {
          flag.environments.production.fallthrough = createRolloutOutcome(
            'remove-me',
            'keep-id',
            'keep-id'
          );
        },
        selector: 'remove-me',
        expectedPath: 'production.fallthrough.from',
      },
      {
        description: 'rollout to',
        mutate: (flag: TestFlag) => {
          flag.environments.production.fallthrough = createRolloutOutcome(
            'keep-id',
            'remove-me',
            'keep-id'
          );
        },
        selector: 'remove-me',
        expectedPath: 'production.fallthrough.to',
      },
      {
        description: 'rollout default',
        mutate: (flag: TestFlag) => {
          flag.environments.production.fallthrough = createRolloutOutcome(
            'keep-id',
            'keep-id',
            'remove-me'
          );
        },
        selector: 'remove-me',
        expectedPath: 'production.fallthrough.default',
      },
      {
        description: 'targets',
        mutate: (flag: TestFlag) => {
          flag.environments.production.targets = {
            'remove-me': {
              user: {
                plan: [{ value: 'pro' }],
              },
            },
          };
        },
        selector: 'remove-me',
        expectedPath: 'production.targets.user.plan',
      },
    ])('blocks variant references', async ({
      mutate,
      selector,
      expectedPath,
    }) => {
      makeNonInteractive();
      const referenceFlag = createReferenceFlag();
      mutate(referenceFlag);
      testFlags.push(referenceFlag);
      client.setArgv(
        'flags',
        'update',
        'reference-feature',
        '--remove-variant',
        selector,
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain('Cannot remove variant');
      expect(client.stderr.getFullOutput()).toContain(expectedPath);
      expect(getFlag('reference-feature').variants).toHaveLength(
        referenceFlag.variants.length
      );
    });

    it('allows removal when targets reference the variant with an empty list', async () => {
      makeNonInteractive();
      const referenceFlag = createReferenceFlag();
      referenceFlag.environments.production.targets = {
        'remove-me': {
          user: {
            plan: [],
          },
        },
      };
      testFlags.push(referenceFlag);
      client.setArgv(
        'flags',
        'update',
        'reference-feature',
        '--remove-variant',
        'remove-me',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(
        getFlag('reference-feature').variants.map(v => v.id)
      ).not.toContain('remove-me');
    });

    it('reports each referenced variant when multiple removals are blocked', async () => {
      makeNonInteractive();
      const referenceFlag = createReferenceFlag();
      referenceFlag.environments.production.fallthrough = {
        type: 'variant',
        variantId: 'remove-me',
      };
      referenceFlag.environments.production.pausedOutcome = {
        type: 'variant',
        variantId: 'targeted',
      };
      testFlags.push(referenceFlag);
      client.setArgv(
        'flags',
        'update',
        'reference-feature',
        '--remove-variant',
        'remove-me',
        '--remove-variant',
        'targeted',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Cannot remove variants because they are still referenced'
      );
      expect(client.stderr.getFullOutput()).toContain('production.fallthrough');
      expect(client.stderr.getFullOutput()).toContain(
        'production.pausedOutcome'
      );
    });

    it('only lists still-referenced variants in the removal error', async () => {
      makeNonInteractive();
      const referenceFlag = createReferenceFlag();
      referenceFlag.environments.production.fallthrough = {
        type: 'variant',
        variantId: 'remove-me',
      };
      testFlags.push(referenceFlag);
      client.setArgv(
        'flags',
        'update',
        'reference-feature',
        '--remove-variant',
        'remove-me',
        '--remove-variant',
        'targeted',
        '--yes'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Cannot remove variant because it is still referenced'
      );
      expect(client.stderr.getFullOutput()).toContain('"remove-me"');
      // "targeted" is unreferenced, so it must not appear in a detail line;
      // its id and value share the same lowercase text, so this also covers
      // the value-only and id-only forms of that line.
      expect(client.stderr.getFullOutput()).not.toContain('targeted');
    });
  });

  it('supports interactive fallback', async () => {
    selectMock.mockResolvedValueOnce('default');
    textMock
      .mockResolvedValueOnce('welcome-back')
      .mockResolvedValueOnce('Welcome back')
      .mockResolvedValueOnce('Rename control variant');

    client.setArgv('flags', 'update', testFlags[1].slug);

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(selectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Select a variant to update:',
        choices: [
          {
            name: `"control" Control ${chalk.dim('[id: default]')}`,
            value: 'default',
          },
          {
            name: `"variant-a" Variant A ${chalk.dim('[id: variant-a]')}`,
            value: 'variant-a',
          },
        ],
      })
    );
    expect(testFlags[1].variants[0]).toMatchObject({
      id: 'default',
      value: 'welcome-back',
      label: 'Welcome back',
    });
    expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
      'Rename control variant'
    );
  });

  it('does not prompt for a message when no variant changes are made', async () => {
    textMock.mockResolvedValueOnce('').mockResolvedValueOnce('');

    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'control'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(textMock).toHaveBeenCalledTimes(2);
    expect(client.stderr.getFullOutput()).toContain('already up to date');
    expect(
      (testFlags[1] as Flag & { message?: string }).message
    ).toBeUndefined();
  });

  it('errors in non-interactive mode when no updates are provided', async () => {
    makeNonInteractive();
    client.setArgv('flags', 'update', testFlags[1].slug);

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing required flag --variant'
    );
  });

  it('errors in non-interactive mode when variant is missing', async () => {
    makeNonInteractive();
    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--value',
      'welcome-back'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing required flag --variant'
    );
  });

  it('errors in non-interactive mode when neither value nor label is provided', async () => {
    makeNonInteractive();
    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'control'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'At least one of --value or --label must be provided'
    );
  });

  it('updates in non-interactive mode without a message', async () => {
    makeNonInteractive();
    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'control',
      '--label',
      'Welcome back'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
      'Updated via CLI'
    );
  });

  it('uses the default message in interactive mode when none is provided', async () => {
    textMock
      .mockResolvedValueOnce('welcome-back')
      .mockResolvedValueOnce('Welcome back')
      .mockResolvedValueOnce('');

    client.setArgv(
      'flags',
      'update',
      testFlags[1].slug,
      '--variant',
      'control'
    );

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(textMock.mock.calls[2][0].default).toEqual('Updated via CLI');
    expect((testFlags[1] as Flag & { message?: string }).message).toEqual(
      'Updated via CLI'
    );
  });
});
