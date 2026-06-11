import { describe, it, expect, beforeEach } from 'vitest';
import flags from '../../../../src/commands/flags';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags, defaultFlags } from '../../../mocks/flags';
import type { Flag } from '../../../../src/util/flags/types';

const DAY = 24 * 60 * 60 * 1000;

describe('flags stale', () => {
  let flagsList: Flag[];

  beforeEach(() => {
    const now = Date.now();
    flagsList = JSON.parse(JSON.stringify(defaultFlags)) as Flag[];
    flagsList[0].slug = 'stale-feature';
    flagsList[0].updatedAt = now - 91 * DAY;
    flagsList[1].slug = 'fresh-feature';
    flagsList[1].updatedAt = now - 10 * DAY;

    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
    });
    useFlags(flagsList);
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
  });

  it('tracks `stale` subcommand and default options', async () => {
    client.setArgv('flags', 'stale');
    await flags(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:stale',
        value: 'stale',
      },
      {
        key: 'option:state',
        value: 'active',
      },
      {
        key: 'option:older-than',
        value: '90d',
      },
    ]);
  });

  describe('--json', () => {
    it('outputs stale flags older than the default threshold', async () => {
      client.setArgv('flags', 'stale', '--json');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.olderThan.value).toEqual('90d');
      expect(parsed.olderThan.cutoff).toEqual(expect.any(Number));
      expect(parsed.flags).toHaveLength(1);
      expect(parsed.flags[0]).toMatchObject({
        slug: 'stale-feature',
        staleFor: expect.any(Number),
      });
    });

    it('uses the configured duration threshold', async () => {
      client.setArgv('flags', 'stale', '--older-than', '1w', '--json');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.flags.map((flag: { slug: string }) => flag.slug)).toEqual([
        'stale-feature',
        'fresh-feature',
      ]);
    });
  });

  describe('--state', () => {
    it('lists stale archived flags', async () => {
      flagsList[0].state = 'archived';
      flagsList[1].state = 'archived';

      client.setArgv('flags', 'stale', '--state', 'archived', '--json');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.flags).toHaveLength(1);
      expect(parsed.flags[0]).toMatchObject({
        slug: 'stale-feature',
        state: 'archived',
      });
    });

    it('errors for invalid state values', async () => {
      client.setArgv('flags', 'stale', '--state', 'deleted');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain('Invalid state');
    });
  });

  describe('--older-than', () => {
    it('accepts configurable durations', async () => {
      client.setArgv('flags', 'stale', '--older-than', '90d', '--json');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.olderThan.value).toEqual('90d');
      expect(parsed.flags).toHaveLength(1);
    });

    it('errors for invalid durations', async () => {
      client.setArgv('flags', 'stale', '--older-than', 'forever');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain('Invalid time format');
    });
  });
});
