import { describe, expect, it, beforeEach, vi } from 'vitest';
import flags from '../../../../src/commands/flags';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { defaultSegments, useFlags } from '../../../mocks/flags';
import type { Segment } from '../../../../src/util/flags/types';
import { formatFlagConditionComparatorList } from '../../../../src/util/flags/comparators';

function expectHelpOutputToListRuleOperators(output: string) {
  expect(output.replace(/\s+/g, ' ')).toContain(
    `Valid operators: ${formatFlagConditionComparatorList()}`
  );
}

describe('flags segments', () => {
  let segmentsList: Segment[];
  const confirmMock = vi.fn();

  beforeEach(() => {
    segmentsList = JSON.parse(JSON.stringify(defaultSegments)) as Segment[];
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
    });
    useFlags(undefined, undefined, undefined, segmentsList);
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
    client.stdin.isTTY = false;
    client.input.confirm = confirmMock;
    confirmMock.mockReset();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('flags', 'segments', '--help');

      await expect(flags(client)).resolves.toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:segments',
          value: 'segments',
        },
        {
          key: 'flag:help',
          value: 'flags segments',
        },
      ]);
    });

    it('shows rule operators in create help', async () => {
      client.setArgv('flags', 'segments', 'create', '--help');

      const exitCode = await flags(client);

      expect(exitCode).toEqual(2);
      expectHelpOutputToListRuleOperators(client.stderr.getFullOutput());
    });

    it('shows rule operators in update help', async () => {
      client.setArgv('flags', 'segments', 'update', '--help');

      const exitCode = await flags(client);

      expect(exitCode).toEqual(2);
      expectHelpOutputToListRuleOperators(client.stderr.getFullOutput());
    });
  });

  it('errors when invoked without subcommand', async () => {
    client.setArgv('flags', 'segments');

    await expect(flags(client)).resolves.toBe(2);
  });

  describe('ls', () => {
    it('lists segments as JSON', async () => {
      client.setArgv('flags', 'segments', 'ls', '--json');

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.segments).toHaveLength(2);
      expect(parsed.segments[0]).toHaveProperty('slug');
      expect(parsed.segments[0]).toHaveProperty('data');
    });

    it('tracks `ls` subcommand', async () => {
      client.setArgv('flags', 'segments', 'ls');

      await flags(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:segments',
          value: 'segments',
        },
        {
          key: 'subcommand:ls',
          value: 'ls',
        },
      ]);
    });
  });

  describe('inspect', () => {
    it('prints segment rule IDs', async () => {
      client.setArgv('flags', 'segments', 'inspect', 'beta-users');

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(client.stderr.getFullOutput()).toContain('Rule ID:');
      expect(client.stderr.getFullOutput()).toContain('rule_plan');
    });

    it('prints segment JSON', async () => {
      client.setArgv('flags', 'segments', 'inspect', 'beta-users', '--json');

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.segment.slug).toEqual('beta-users');
      expect(parsed.segment.data.include.user.id[0]).toMatchObject({
        value: 'user_123',
        note: 'founder',
      });
    });
  });

  describe('create', () => {
    it('creates a segment with include values and rules', async () => {
      client.setArgv(
        'flags',
        'segments',
        'create',
        'enterprise-users',
        '--label',
        'Enterprise users',
        '--add',
        'include:user.id=user_789|manual add',
        '--add',
        'rule:user.plan:eq:enterprise'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(segmentsList).toHaveLength(3);
      expect(segmentsList[2]).toMatchObject({
        slug: 'enterprise-users',
        label: 'Enterprise users',
        hint: 'Enterprise users',
        data: {
          include: {
            user: {
              id: [{ value: 'user_789', note: 'manual add' }],
            },
          },
        },
      });
      expect(segmentsList[2].data.rules?.[0].conditions[0]).toMatchObject({
        lhs: { type: 'entity', kind: 'user', attribute: 'plan' },
        cmp: 'eq',
        rhs: 'enterprise',
      });
    });

    it('creates a segment from full data JSON', async () => {
      client.setArgv(
        'flags',
        'segments',
        'create',
        'staff-allowlist',
        '--label',
        'Staff allowlist',
        '--data',
        '{"rules":[],"include":{"user":{"email":[{"value":"me@company.com"}]}},"exclude":{}}',
        '--json'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.segment.slug).toEqual('staff-allowlist');
      expect(parsed.segment.data.include.user.email[0]).toMatchObject({
        value: 'me@company.com',
      });
    });

    it('normalizes contains aliases to the API comparator id', async () => {
      client.setArgv(
        'flags',
        'segments',
        'create',
        'non-gmail-users',
        '--label',
        'Non Gmail users',
        '--add',
        'rule:user.email:not-contains:gmail.com'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(segmentsList[2].data.rules?.[0].conditions[0]).toMatchObject({
        lhs: { type: 'entity', kind: 'user', attribute: 'email' },
        cmp: '!contains',
        rhs: 'gmail.com',
      });
    });

    it('lists valid operators when a rule operator is invalid', async () => {
      client.setArgv(
        'flags',
        'segments',
        'create',
        'invalid-rule',
        '--label',
        'Invalid rule',
        '--add',
        'rule:user.plan:near:pro'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Invalid segment rule operator "near"'
      );
      expect(client.stderr.getFullOutput()).toContain(
        'Valid operators: eq, !eq, oneOf, !oneOf'
      );
      expect(segmentsList.map(segment => segment.slug)).toEqual([
        'beta-users',
        'staff',
      ]);
    });
  });

  describe('update', () => {
    it('adds and removes values with operations', async () => {
      client.setArgv(
        'flags',
        'segments',
        'update',
        'beta-users',
        '--add',
        'include:user.id=user_456',
        '--remove',
        'include:user.id=user_123'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(segmentsList[0].data.include?.user.id).toMatchObject([
        { value: 'user_456' },
      ]);
    });

    it('adds and removes rules while preserving existing include and exclude data', async () => {
      client.setArgv(
        'flags',
        'segments',
        'update',
        'beta-users',
        '--add',
        'rule:user.email:ends-with:@company.com',
        '--add',
        'rule:user.country:eq:US',
        '--remove',
        'rule:user.plan:eq:pro'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(segmentsList[0].data.include?.user.id[0]).toMatchObject({
        value: 'user_123',
      });
      expect(segmentsList[0].data.rules).toHaveLength(2);
      expect(
        segmentsList[0].data.rules?.map(rule => rule.conditions[0])
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            lhs: { type: 'entity', kind: 'user', attribute: 'country' },
            cmp: 'eq',
            rhs: 'US',
          }),
          expect.objectContaining({
            lhs: { type: 'entity', kind: 'user', attribute: 'email' },
            cmp: 'endsWith',
            rhs: '@company.com',
          }),
        ])
      );
    });

    it('removes list-style rules stored by the API', async () => {
      segmentsList[0].data.rules = [
        ...(segmentsList[0].data.rules ?? []),
        {
          id: 'rule_plan_list',
          conditions: [
            {
              lhs: { type: 'entity', kind: 'user', attribute: 'plan' },
              cmp: 'oneOf',
              rhs: {
                type: 'list',
                items: [{ value: 'pro' }, { value: 'enterprise' }],
              },
            },
          ],
          outcome: { type: 'all' },
        },
      ];

      client.setArgv(
        'flags',
        'segments',
        'update',
        'beta-users',
        '--remove',
        'rule:user.plan:in:pro,enterprise'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(segmentsList[0].data.rules).toHaveLength(1);
      expect(segmentsList[0].data.rules?.[0].id).toEqual('rule_plan');
    });

    it('errors when removing a rule ID that does not exist', async () => {
      client.setArgv(
        'flags',
        'segments',
        'update',
        'beta-users',
        '--remove',
        'rule:missing_rule'
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Segment rule "missing_rule" does not exist.'
      );
      expect(segmentsList[0].data.rules?.map(rule => rule.id)).toEqual([
        'rule_plan',
      ]);
    });

    it.each([
      'include',
      'exclude',
    ])('errors when removing a %s value that does not exist', async field => {
      client.setArgv(
        'flags',
        'segments',
        'update',
        'beta-users',
        '--remove',
        `${field}:user.id=neverexisted`
      );

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        `Segment ${field} value "user.id=neverexisted" does not exist.`
      );
      expect(segmentsList[0].data.include?.user.id).toMatchObject([
        { value: 'user_123', note: 'founder' },
      ]);
      expect(segmentsList[0].data.exclude).toEqual({});
    });
  });

  describe('rm', () => {
    it('requires --yes when stdin is not a TTY', async () => {
      client.setArgv('flags', 'segments', 'rm', 'staff');

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Missing required flag --yes'
      );
      expect(confirmMock).not.toHaveBeenCalled();
      expect(segmentsList.map(segment => segment.slug)).toEqual([
        'beta-users',
        'staff',
      ]);
    });

    it('deletes a segment with --yes', async () => {
      client.setArgv('flags', 'segments', 'rm', 'staff', '--yes');

      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      expect(segmentsList.map(segment => segment.slug)).toEqual(['beta-users']);
    });

    it('shows API reference details when deleting an in-use segment', async () => {
      segmentsList[0].usedBySegments = ['staff'];
      client.setArgv('flags', 'segments', 'rm', 'beta-users', '--yes');

      const exitCode = await flags(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        "Segment beta-users is still in use and can't be deleted."
      );
      expect(client.stderr.getFullOutput()).toContain(
        'Used by feature flags: my-feature'
      );
      expect(client.stderr.getFullOutput()).toContain(
        'Used by segments: Staff (staff)'
      );
      expect(client.stderr.getFullOutput()).toContain(
        'Run `vercel flags inspect my-feature` to inspect one reference'
      );
      expect(segmentsList.map(segment => segment.slug)).toEqual([
        'beta-users',
        'staff',
      ]);
    });
  });
});
