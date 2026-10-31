import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it } from 'vitest';
import flags from '../../../../src/commands/flags';
import type { Flag, UpdateFlagRequest } from '../../../../src/util/flags/types';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import {
  defaultFlagSettings,
  defaultFlags,
  useFlags,
} from '../../../mocks/flags';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

interface LabelBulkBody {
  items: Array<{
    operation: string;
    entityKind: string;
    attributeKey: string;
    value: string;
    label?: string;
  }>;
}

type TargetValue = string | { value: string; note?: string };

const stderr = () => stripAnsi(client.stderr.getFullOutput());
const stdoutJson = () => JSON.parse(client.stdout.getFullOutput());

function userIds(...values: TargetValue[]) {
  return {
    user: {
      userId: values.map(value =>
        typeof value === 'string' ? { value } : value
      ),
    },
  };
}

describe('flags targets', () => {
  let testFlags: Flag[];
  let patchBodies: UpdateFlagRequest[];
  let labelBodies: LabelBulkBody[];
  let labelResponse:
    | { status: number; body: unknown }
    | ((body: LabelBulkBody) => unknown)
    | undefined;

  const production = () => testFlags[0].environments.production;
  const patchedTargets = (environment = 'production') =>
    patchBodies[0].environments?.[environment]?.targets;

  function run(...args: string[]) {
    client.setArgv('flags', 'targets', ...args);
    return flags(client);
  }

  beforeEach(() => {
    testFlags = JSON.parse(JSON.stringify(defaultFlags)) as Flag[];
    patchBodies = [];
    labelBodies = [];
    labelResponse = undefined;
    client.scenario.patch(
      '/v1/projects/:projectId/feature-flags/labels/bulk',
      (req, res) => {
        const body = req.body as LabelBulkBody;
        labelBodies.push(body);
        if (typeof labelResponse === 'function') {
          res.json(labelResponse(body));
        } else if (labelResponse) {
          res.status(labelResponse.status).json(labelResponse.body);
        } else {
          res.json({ labels: body.items, errors: [] });
        }
      }
    );
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
    });
    useFlags(testFlags, undefined, defaultFlagSettings, undefined, request => {
      patchBodies.push(request);
    });
    client.cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.stdin.isTTY = false;
  });

  describe('--help', () => {
    it('tracks telemetry for nested help', async () => {
      await expect(run('--help')).resolves.toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:targets', value: 'targets' },
        { key: 'flag:help', value: 'flags targets' },
      ]);
    });

    it('shows the repeatable target argument in add help', async () => {
      await expect(run('add', '--help')).resolves.toEqual(0);
      expect(stderr()).toContain(
        'flags targets add <flag> <entity.attribute=value>... [options]'
      );
    });
  });

  describe('list', () => {
    it('lists targets with labels and variants', async () => {
      production().targets = {
        on: {
          user: { userId: [{ value: 'user_001' }], plan: [{ value: 'pro' }] },
        },
        off: userIds({ value: 'user_002', note: 'churn risk' }),
      };

      await expect(
        run('ls', 'my-feature', '-e', 'production')
      ).resolves.toEqual(0);
      expect(stderr()).toContain(
        '3 targets found for my-feature in production'
      );
      expect(stderr()).toMatch(/user\.userId\s+user_001\s+On/);
      expect(stderr()).toMatch(/user\.plan\s+pro\s+Pro Plan\s+On/);
      expect(stderr()).toMatch(/user\.userId\s+user_002\s+churn risk\s+Off/);
    });

    it('suggests an add command when there are no targets', async () => {
      await expect(
        run('ls', 'my-feature', '-e', 'production')
      ).resolves.toEqual(0);
      expect(stderr()).toContain(
        'No targets found for my-feature in production'
      );
      expect(stderr()).toContain(
        'vercel flags targets add my-feature --environment production user.id=user_123'
      );
    });

    it('lists the stored targets of a reused environment with the mode as JSON', async () => {
      production().reuse = { active: true, environment: 'preview' };
      production().targets = { on: userIds('user_stored') };
      testFlags[0].environments.preview.targets = {
        on: userIds('user_preview'),
      };

      await expect(
        run('ls', 'my-feature', '-e', 'production', '--json')
      ).resolves.toEqual(0);
      expect(stdoutJson()).toEqual({
        flag: 'my-feature',
        environment: 'production',
        active: true,
        reuse: { active: true, environment: 'preview' },
        targets: { on: userIds('user_stored') },
      });
      expect(stderr()).not.toContain('found for');
    });

    it('notes when a paused environment does not evaluate its targets', async () => {
      production().active = false;
      production().targets = { on: userIds('user_001') };

      await expect(
        run('ls', 'my-feature', '-e', 'production')
      ).resolves.toEqual(0);
      expect(stderr()).toContain('1 target found for my-feature in production');
      expect(stderr()).toContain(
        '! production is serving Off (false); these targets are not evaluated until targeting is active again.'
      );
    });

    it('notes when a reused environment does not evaluate its targets', async () => {
      production().reuse = { active: true, environment: 'preview' };
      production().targets = { on: userIds('user_001') };

      await expect(
        run('ls', 'my-feature', '-e', 'production')
      ).resolves.toEqual(0);
      expect(stderr()).toContain(
        '! production reuses preview; these targets are not evaluated'
      );
    });

    it('rejects --json without --environment instead of prompting', async () => {
      client.stdin.isTTY = true;

      await expect(run('ls', 'my-feature', '--json')).resolves.toEqual(2);
      expect(client.stdout.getFullOutput()).toEqual('');
      expect(stderr()).toContain(
        'Missing required option --environment when using --json'
      );
    });
  });

  describe('add', () => {
    const add = (...args: string[]) =>
      run('add', 'my-feature', '-e', 'production', ...args);

    it('defaults boolean flags to the true variant and PATCHes only that environment', async () => {
      await expect(
        add(
          'user.userId=user_001',
          'user.userId=user_002',
          '--message',
          'Target beta users'
        )
      ).resolves.toEqual(0);
      expect(patchBodies).toEqual([
        {
          message: 'Target beta users',
          environments: {
            production: expect.objectContaining({
              active: true,
              targets: { on: userIds('user_001', 'user_002') },
            }),
          },
        },
      ]);
      expect(patchBodies[0].environments?.production?.rules).toHaveLength(2);
      expect(stderr()).toContain('2 targets added to my-feature in production');
      expect(stderr()).toContain('user.userId=user_001 → On');
      expect(stderr()).toContain('user.userId=user_002 → On');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:targets', value: 'targets' },
        { key: 'subcommand:add', value: 'add' },
        { key: 'argument:flag', value: '[REDACTED]' },
        { key: 'argument:target', value: '[REDACTED]' },
        { key: 'option:environment', value: 'production' },
        { key: 'option:message', value: '[REDACTED]' },
      ]);
    });

    it('moves a value that another variant already targets', async () => {
      production().targets = { off: userIds('user_001', 'user_002') };

      await expect(
        add('--variant', 'true', 'user.userId=user_001')
      ).resolves.toEqual(0);
      expect(patchedTargets()).toEqual({
        off: userIds('user_002'),
        on: userIds('user_001'),
      });
      expect(stderr()).toContain('user.userId=user_001 → On (moved from Off)');
    });

    it('keeps the note of a moved target', async () => {
      production().targets = {
        off: userIds({ value: 'user_001', note: 'churn risk' }),
      };

      await expect(add('user.userId=user_001')).resolves.toEqual(0);
      expect(patchedTargets()).toEqual({
        on: userIds({ value: 'user_001', note: 'churn risk' }),
      });
    });

    it('does not PATCH when every target already serves the variant', async () => {
      production().targets = { on: userIds('user_001') };

      await expect(
        add('user.userId=user_001', 'user.userId=user_001')
      ).resolves.toEqual(0);
      expect(patchBodies).toHaveLength(0);
      expect(stderr()).toContain(
        '1 target already serves On in production; nothing to change'
      );
    });

    it('requires --variant for non-boolean flags', async () => {
      await expect(
        run(
          'add',
          'another-feature',
          '-e',
          'production',
          'user.userId=user_001'
        )
      ).resolves.toEqual(2);
      expect(patchBodies).toHaveLength(0);
      expect(stderr()).toContain('Missing required option --variant');
    });

    it('resolves string variants by value and prints JSON', async () => {
      await expect(
        run(
          'add',
          'another-feature',
          '-e',
          'preview',
          '--variant',
          'variant-a',
          'user.plan=enterprise',
          '--json'
        )
      ).resolves.toEqual(0);
      expect(stdoutJson()).toEqual({
        flag: 'another-feature',
        environment: 'preview',
        targets: { 'variant-a': { user: { plan: [{ value: 'enterprise' }] } } },
      });
      expect(patchBodies[0].message).toEqual('Add 1 target to preview');
    });

    it.each([
      [
        'user.email=me@example.com',
        'Attribute "user.email" does not exist. Available attributes: user.plan, user.userId, user.signupAt.',
      ],
      [
        'user.signupAt=1700000000000',
        'Only string attributes can be targeted directly. user.signupAt is a timestamp attribute.',
      ],
      ['user_001', 'Invalid target "user_001". Use ENTITY.ATTRIBUTE=VALUE'],
      ['user.userId=user_001|', 'Label cannot be empty'],
    ])('rejects %s before PATCHing', async (target, message) => {
      await expect(add(target)).resolves.toEqual(1);
      expect(patchBodies).toHaveLength(0);
      expect(labelBodies).toHaveLength(0);
      expect(stderr()).toContain(message);
    });

    it('requires a flag and at least one target', async () => {
      await expect(add()).resolves.toEqual(2);
      expect(stderr()).toContain(
        'at least one target as ENTITY.ATTRIBUTE=VALUE'
      );
    });

    it('warns when the environment is paused', async () => {
      testFlags[0].environments.preview.active = false;

      await expect(
        run('add', 'my-feature', '-e', 'preview', 'user.userId=user_001')
      ).resolves.toEqual(0);
      expect(patchBodies[0].environments?.preview).toMatchObject({
        active: false,
        targets: { on: userIds('user_001') },
      });
      expect(stderr()).toMatch(
        /^! This target update was saved, but preview is serving Off \(false\)\. Target changes will not affect/m
      );
    });

    it('edits the stored targets of a reused environment without touching reuse', async () => {
      production().reuse = { active: true, environment: 'preview' };
      production().targets = { off: userIds('user_stored') };
      testFlags[0].environments.preview.targets = {
        off: userIds('user_preview'),
      };

      await expect(add('user.userId=user_001')).resolves.toEqual(0);
      expect(patchBodies[0].environments?.production).toMatchObject({
        reuse: { active: true, environment: 'preview' },
        fallthrough: { type: 'variant', variantId: 'off' },
        targets: { off: userIds('user_stored'), on: userIds('user_001') },
      });
      expect(patchBodies[0].environments?.production?.rules).toHaveLength(2);
      expect(testFlags[0].environments.preview.targets).toEqual({
        off: userIds('user_preview'),
      });
      expect(stderr()).toMatch(
        /^! This target update was saved, but production reuses preview\. Target changes will not affect flag evaluation until targeting is active again\./m
      );
      expect(stderr()).toContain(
        'vercel flags targeting enable my-feature --environment production'
      );
    });

    it('sets a label alongside the target when the value carries |LABEL', async () => {
      await expect(
        add('user.userId=user_001|Ada', 'user.userId=user_002')
      ).resolves.toEqual(0);
      expect(patchBodies).toHaveLength(1);
      expect(patchedTargets()).toEqual({ on: userIds('user_001', 'user_002') });
      expect(labelBodies).toEqual([
        {
          items: [
            {
              operation: 'upsert',
              entityKind: 'user',
              attributeKey: 'userId',
              value: 'user_001',
              label: 'Ada',
            },
          ],
        },
      ]);
      expect(stderr()).toContain(
        '2 targets added to my-feature in production (1 label set)'
      );
      expect(stderr()).toContain('user.userId=user_001 Ada → On');
    });

    it('still sets the label when the target is already in place', async () => {
      production().targets = { on: userIds('user_001') };

      await expect(add('user.userId=user_001|Ada')).resolves.toEqual(0);
      expect(patchBodies).toHaveLength(0);
      expect(labelBodies).toHaveLength(1);
      expect(stderr()).toContain(
        'Targets of my-feature in production unchanged (1 label set)'
      );
    });

    it('does not rewrite a label that already matches', async () => {
      production().targets = { on: { user: { plan: [{ value: 'pro' }] } } };

      await expect(
        add('user.plan=pro|Pro Plan', 'user.plan=enterprise|Enterprise')
      ).resolves.toEqual(0);
      expect(patchedTargets()).toEqual({
        on: { user: { plan: [{ value: 'pro' }, { value: 'enterprise' }] } },
      });
      expect(labelBodies).toEqual([
        {
          items: [
            {
              operation: 'upsert',
              entityKind: 'user',
              attributeKey: 'plan',
              value: 'enterprise',
              label: 'Enterprise',
            },
          ],
        },
      ]);
      expect(stderr()).toContain(
        '1 target added to my-feature in production (1 label set)'
      );
    });

    it('treats a matching label on an existing target as nothing to change', async () => {
      production().targets = { on: { user: { plan: [{ value: 'pro' }] } } };

      await expect(add('user.plan=pro|Pro Plan')).resolves.toEqual(0);
      expect(patchBodies).toHaveLength(0);
      expect(labelBodies).toHaveLength(0);
      expect(stderr()).toContain('nothing to change');
    });

    it('refuses more than 100 labels before writing anything', async () => {
      const targets = Array.from(
        { length: 101 },
        (_, index) => `user.userId=user_${index}|Label ${index}`
      );

      await expect(add(...targets)).resolves.toEqual(1);
      expect(patchBodies).toHaveLength(0);
      expect(labelBodies).toHaveLength(0);
      expect(stderr()).toContain('Cannot set more than 100 labels at once');
    });

    it('reports the target as saved and the label as pending when the label write fails', async () => {
      labelResponse = { status: 500, body: { error: { message: 'boom' } } };

      await expect(add('user.userId=user_001|Ada Lovelace')).resolves.toEqual(
        1
      );
      expect(patchBodies).toHaveLength(1);
      expect(stderr()).toContain('1 target added to my-feature in production');
      expect(stderr()).not.toContain('(1 label set)');
      expect(stderr()).toContain('user.userId=user_001 → On');
      expect(stderr()).toContain('1 label was not saved');
      expect(stderr()).toContain(
        "vercel flags labels set user.userId user_001 'Ada Lovelace'"
      );
    });

    it('surfaces per-item label errors and returns them in JSON', async () => {
      labelResponse = body => ({
        labels: [],
        errors: body.items.map(item => ({
          entityKind: item.entityKind,
          attributeKey: item.attributeKey,
          value: item.value,
          code: 'LABEL_TOO_LONG',
          message: 'Label too long',
        })),
      });

      await expect(add('user.userId=user_001|Ada', '--json')).resolves.toEqual(
        1
      );
      expect(stdoutJson()).toEqual({
        flag: 'my-feature',
        environment: 'production',
        targets: { on: userIds('user_001') },
        labels: {
          labels: [],
          errors: [
            {
              entityKind: 'user',
              attributeKey: 'userId',
              value: 'user_001',
              code: 'LABEL_TOO_LONG',
              message: 'Label too long',
            },
          ],
        },
      });
    });

    it('updates targets without unarchiving the flag', async () => {
      testFlags[0].state = 'archived';

      await expect(add('user.userId=user_001')).resolves.toEqual(0);
      expect(patchedTargets()).toEqual({ on: userIds('user_001') });
      expect(patchBodies[0]).not.toHaveProperty('state');
      expect(testFlags[0].state).toBe('archived');
      expect(stderr()).toContain('This flag remains archived');
    });
  });

  describe('remove', () => {
    const remove = (...args: string[]) =>
      run('rm', 'my-feature', '-e', 'production', ...args);

    it.each([
      'active',
      'archived',
    ] as const)('removes targets from whichever variant serves them and prunes empty maps (%s)', async state => {
      testFlags[0].state = state;
      production().targets = {
        on: {
          user: {
            userId: [{ value: 'user_001' }, { value: 'user_002' }],
            plan: [{ value: 'pro' }],
          },
        },
        off: userIds('user_003'),
      };

      await expect(
        remove('user.userId=user_001', 'user.userId=user_003', 'user.plan=pro')
      ).resolves.toEqual(0);
      expect(patchedTargets()).toEqual({ on: userIds('user_002') });
      expect(patchBodies[0].message).toEqual(
        'Remove 3 targets from production'
      );
      expect(stderr()).toContain(
        '3 targets removed from my-feature in production'
      );
      expect(stderr()).toContain('user.userId=user_003 (was Off)');
      expect(stderr()).toContain('user.plan=pro Pro Plan (was On)');
      expect(testFlags[0].state).toBe(state);
    });

    it('fails without PATCHing when a target does not exist', async () => {
      production().targets = { on: userIds('user_001') };

      await expect(
        remove('user.userId=user_001', 'user.userId=missing')
      ).resolves.toEqual(1);
      expect(patchBodies).toHaveLength(0);
      expect(stderr()).toContain(
        'Target "user.userId=missing" does not exist.'
      );
    });

    it('treats "|" as part of the value so such targets can still be removed', async () => {
      production().targets = { on: userIds('user_001|Ada') };

      await expect(remove('user.userId=user_001|Ada')).resolves.toEqual(0);
      expect(patchedTargets()).toEqual({});
    });

    it('matches stored values exactly, including surrounding whitespace', async () => {
      production().targets = { on: userIds(' spaced ', 'spaced') };

      await expect(remove('user.userId= spaced ')).resolves.toEqual(0);
      expect(patchedTargets()).toEqual({ on: userIds('spaced') });
    });

    it('ignores repeated targets', async () => {
      production().targets = { on: userIds('user_001') };

      await expect(
        remove('user.userId=user_001', 'user.userId=user_001')
      ).resolves.toEqual(0);
      expect(patchedTargets()).toEqual({});
      expect(stderr()).toContain(
        '1 target removed from my-feature in production'
      );
    });

    it('prints the remaining targets as JSON', async () => {
      production().targets = { on: userIds('user_001') };

      await expect(remove('user.userId=user_001', '--json')).resolves.toEqual(
        0
      );
      expect(stdoutJson()).toEqual({
        flag: 'my-feature',
        environment: 'production',
        targets: {},
      });
    });
  });
});
