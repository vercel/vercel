import { describe, it, expect, beforeEach } from 'vitest';
import flags from '../../../../src/commands/flags';
import {
  removeProjectLink,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags, defaultFlags } from '../../../mocks/flags';
import type { Flag } from '../../../../src/util/flags/types';
import { expectDeprecationInJson } from '../../../helpers/deprecation-warning';

describe('flags ls', () => {
  let flagsList: Flag[];

  beforeEach(() => {
    flagsList = JSON.parse(JSON.stringify(defaultFlags)) as Flag[];
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
      accountId: 'team_dummy',
    });
    useFlags(flagsList);
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
  });

  it('tracks `ls` subcommand', async () => {
    client.setArgv('flags', 'ls');
    await flags(client);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:ls',
        value: 'ls',
      },
      {
        key: 'option:state',
        value: 'active',
      },
    ]);
  });

  it('lists flags with --project when the cwd is not linked', async () => {
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    removeProjectLink(cwd);
    client.cwd = cwd;

    client.setArgv('flags', 'ls', '--project', 'vercel-flags-test', '--json');
    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(JSON.parse(client.stdout.getFullOutput()).flags).toHaveLength(2);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:ls', value: 'ls' },
      { key: 'option:project', value: '[REDACTED]' },
      { key: 'option:state', value: 'active' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('reports project not found when --project does not resolve', async () => {
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    removeProjectLink(cwd);
    client.cwd = cwd;
    useUnknownProject();

    client.setArgv('flags', 'ls', '--project', 'no-such-project');
    const exitCodePromise = flags(client);
    await expect(client.stderr).toOutput(
      'Project "no-such-project" was not found'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = flags(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('--state', () => {
    it('tracks `state` option', async () => {
      client.setArgv('flags', 'ls', '--state', 'archived');
      await flags(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:ls',
          value: 'ls',
        },
        {
          key: 'option:state',
          value: 'archived',
        },
      ]);
    });
  });

  describe('filters', () => {
    it('tracks tag, created-by, and maintainer-id options', async () => {
      client.setArgv(
        'flags',
        'ls',
        '--tag',
        'checkout',
        '--created-by',
        'user_123',
        '--maintainer-id',
        'user_456'
      );
      await flags(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:ls', value: 'ls' },
        { key: 'option:state', value: 'active' },
        { key: 'option:tag', value: '[REDACTED]' },
        { key: 'option:created-by', value: '[REDACTED]' },
        { key: 'option:maintainer-id', value: '[REDACTED]' },
      ]);
    });

    it('filters flags by tag via the v2 endpoint', async () => {
      flagsList[0].tags = ['checkout'];
      flagsList[1].tags = ['growth'];

      client.setArgv('flags', 'ls', '--tag', 'checkout', '--json');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.flags).toHaveLength(1);
      expect(parsed.flags[0].slug).toEqual('my-feature');
    });

    it('filters flags by maintainer id (any may match)', async () => {
      flagsList[0].maintainerIds = ['user_a'];
      flagsList[1].maintainerIds = ['user_b'];

      client.setArgv('flags', 'ls', '--maintainer-id', 'user_b', '--json');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.flags).toHaveLength(1);
      expect(parsed.flags[0].slug).toEqual('another-feature');
    });

    it('returns a single page with a cursor when --limit is set', async () => {
      for (let i = 0; i < 30; i++) {
        flagsList.push({
          ...JSON.parse(JSON.stringify(flagsList[0])),
          id: `flag_page_${i}`,
          slug: `paged-flag-${i}`,
        });
      }

      client.setArgv('flags', 'ls', '--limit', '10', '--json');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.flags).toHaveLength(10);
      expect(parsed.pagination.next).toEqual('10');
    });

    it('resumes from a --next cursor', async () => {
      for (let i = 0; i < 30; i++) {
        flagsList.push({
          ...JSON.parse(JSON.stringify(flagsList[0])),
          id: `flag_page_${i}`,
          slug: `paged-flag-${i}`,
        });
      }

      client.setArgv('flags', 'ls', '--limit', '10', '--next', '10', '--json');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.flags).toHaveLength(10);
      expect(parsed.pagination.next).toEqual('20');
    });

    it('prints a next-page command preserving filters in table output', async () => {
      for (let i = 0; i < 3; i++) {
        flagsList.push({
          ...JSON.parse(JSON.stringify(flagsList[0])),
          id: `flag_tagged_${i}`,
          slug: `tagged-flag-${i}`,
          tags: ['checkout'],
        });
      }

      client.setArgv('flags', 'ls', '--tag', 'checkout', '--limit', '1');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput(
        'flags ls --limit 1 --tag checkout --next 1'
      );
    });

    it('quotes filter values that contain shell metacharacters in the next-page command', async () => {
      for (let i = 0; i < 3; i++) {
        flagsList.push({
          ...JSON.parse(JSON.stringify(flagsList[0])),
          id: `flag_tagged_${i}`,
          slug: `tagged-flag-${i}`,
          tags: ['needs review'],
        });
      }

      client.setArgv('flags', 'ls', '--tag', 'needs review', '--limit', '1');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput(
        "flags ls --limit 1 --tag 'needs review' --next 1"
      );
    });

    it('rejects a --limit below 1', async () => {
      client.setArgv('flags', 'ls', '--limit', '0');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput(
        'The --limit option must be an integer between 1 and 100.'
      );
    });

    it('rejects a --limit above 100', async () => {
      client.setArgv('flags', 'ls', '--limit', '101');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput(
        'The --limit option must be an integer between 1 and 100.'
      );
    });

    it('follows pagination cursors to list all flags', async () => {
      // Exceed the max page size (100) to force multiple pages.
      for (let i = 0; i < 120; i++) {
        flagsList.push({
          ...JSON.parse(JSON.stringify(flagsList[0])),
          id: `flag_page_${i}`,
          slug: `paged-flag-${i}`,
        });
      }

      client.setArgv('flags', 'ls', '--json');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.flags).toHaveLength(flagsList.length);
    });
  });

  describe('--json', () => {
    it('outputs valid JSON with flag data', async () => {
      client.setArgv('flags', 'ls', '--json');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('flags');
      expect(parsed.flags).toHaveLength(2);
      expect(parsed.flags[0]).toHaveProperty('slug');
      expect(parsed.flags[0]).toHaveProperty('kind');
      expect(parsed.flags[0]).toHaveProperty('state');
      expect(parsed.flags[0]).toHaveProperty('variants');
    });

    it('preserves JSON variant values in JSON output', async () => {
      flagsList.push({
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
          production: {
            active: true,
            fallthrough: { type: 'variant', variantId: 'light' },
            pausedOutcome: { type: 'variant', variantId: 'light' },
            rules: [],
          },
          preview: {
            active: true,
            fallthrough: { type: 'variant', variantId: 'light' },
            pausedOutcome: { type: 'variant', variantId: 'light' },
            rules: [],
          },
          development: {
            active: true,
            fallthrough: { type: 'variant', variantId: 'light' },
            pausedOutcome: { type: 'variant', variantId: 'light' },
            rules: [],
          },
        },
        createdAt: Date.now() - 172800000,
        updatedAt: Date.now() - 7200000,
        createdBy: 'user_123',
        projectId: 'vercel-flags-test',
        ownerId: 'team_dummy',
        revision: 1,
        seed: 67890,
        typeName: 'flag',
      });

      client.setArgv('flags', 'ls', '--json');
      const exitCode = await flags(client);

      expect(exitCode).toEqual(0);
      const output = client.stdout.getFullOutput();
      const parsed = JSON.parse(output);
      const jsonFlag = parsed.flags.find(
        (flag: { slug: string }) => flag.slug === 'layout-config'
      );

      expect(jsonFlag.kind).toEqual('json');
      expect(jsonFlag.variants).toMatchObject([
        {
          value: { theme: 'light', sidebar: false },
          label: 'Light',
        },
        {
          value: ['dark', 'compact'],
          label: 'Dark',
        },
      ]);
    });

    it('tracks telemetry for --json', async () => {
      client.setArgv('flags', 'ls', '--json');
      await flags(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:ls',
          value: 'ls',
        },
        {
          key: 'option:state',
          value: 'active',
        },
        {
          key: 'flag:json',
          value: 'TRUE',
        },
      ]);
    });
  });
});

describe('flags ls --maintainer', () => {
  // Runs `flags ls` with a fresh client against two flags with different
  // maintainers.
  async function run(...args: string[]) {
    client.reset();
    const flagsList = JSON.parse(JSON.stringify(defaultFlags)) as Flag[];
    flagsList[0].maintainerIds = ['user_a'];
    flagsList[1].maintainerIds = ['user_b'];
    for (let i = 0; i < 3; i++) {
      flagsList.push({
        ...JSON.parse(JSON.stringify(flagsList[1])),
        id: `flag_b_${i}`,
        slug: `b-flag-${i}`,
      });
    }
    useUser({ id: 'user_1', username: 'tester' });
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
      accountId: 'team_dummy',
    });
    useFlags(flagsList);
    client.cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.setArgv('flags', 'ls', ...args);
    const exitCode = await flags(client);
    return {
      exitCode,
      stdout: client.stdout.getFullOutput(),
      stderr: client.stderr.getFullOutput(),
    };
  }

  it('still accepts --maintainer-id, with one warning that names --maintainer', async () => {
    const now = await run('--maintainer', 'user_b', '--limit', '1');
    const before = await run('--maintainer-id', 'user_b', '--limit', '1');

    expect(now.exitCode).toBe(0);
    expect(now.stderr).not.toContain('deprecated');
    expect(now.stderr).toContain('--maintainer user_b --next 1');
    expect(before.exitCode).toBe(now.exitCode);
    expect(before.stdout).toBe(now.stdout);
    expect(before.stderr.match(/deprecated/g)).toHaveLength(1);
    expect(before.stderr).toContain(
      '! --maintainer-id is deprecated. Use --maintainer.\n'
    );
    expect(before.stderr).toContain('--maintainer user_b --next 1');

    const nowJson = await run('--maintainer', 'user_b', '--json');
    const beforeJson = await run('--maintainer-id', 'user_b', '--json');
    expect(beforeJson.exitCode).toBe(0);
    expect(JSON.parse(beforeJson.stdout).flags).toHaveLength(4);
    expectDeprecationInJson(
      beforeJson.stdout,
      nowJson.stdout,
      '--maintainer-id is deprecated. Use --maintainer.'
    );
    expect(beforeJson.stderr).not.toContain('deprecated');
  });

  it('rejects --maintainer with --maintainer-id', async () => {
    const result = await run('--maintainer', 'a', '--maintainer-id', 'b');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(
      "Can't use --maintainer with --maintainer-id."
    );
    expect(result.stdout).toBe('');
  });
});
