import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import teams from '../../../../src/commands/teams';
import { useUser } from '../../../mocks/user';
import { setTeamBillingPlan, useTeams } from '../../../mocks/team';
import { TEAM_NOT_CHOSEN } from '../../../../src/util/client';

describe('teams ls', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'teams';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = teams(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('non-northstar', () => {
    it('should display your personal account', async () => {
      const user = useUser();
      useTeams(undefined, { apiVersion: 2 });
      client.setArgv('teams', 'ls');
      const exitCodePromise = teams(client);
      await expect(client.stderr).toOutput(user.username);
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "teamsList"').toEqual(0);
      expect(client.stderr.getFullOutput().split(user.email)[1]).toMatch(
        /^\s+-/
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
      ]);
    });
  });

  describe('northstar', () => {
    const username = 'some-user';

    beforeEach(() => {
      useUser({
        username,
        version: 'northstar',
      });
      useTeams(undefined, { apiVersion: 2 });
    });

    it('should display team plans without your personal account', async () => {
      setTeamBillingPlan('pro');
      client.setArgv('teams', 'list');
      const exitCode = await teams(client);
      expect(exitCode, 'exit code for "teams"').toEqual(0);

      const output = client.stderr.getFullOutput();
      expect(output).not.toContain(username);
      expect(output).toMatch(/id\s+Team name\s+Plan/);
      expect(output).toMatch(/\s+pro\s*$/);
    });

    it('--next option should be tracked', async () => {
      client.setArgv(
        'teams',
        'list',
        '--next',
        '1584722256178',
        '--limit',
        '5'
      );
      const exitCode = await teams(client);
      expect(exitCode, 'exit code for "teams"').toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:list', value: 'list' },
        { key: 'option:next', value: '[REDACTED]' },
        { key: 'option:limit', value: '[REDACTED]' },
      ]);
    });

    describe('depreated flags', () => {
      it('--until option should be tracked', async () => {
        client.setArgv('teams', 'list', '--until', '1584722256178');
        const exitCode = await teams(client);
        expect(exitCode, 'exit code for "teams"').toEqual(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          { key: 'subcommand:list', value: 'list' },
          { key: 'option:until', value: '[REDACTED]' },
        ]);
      });

      it('--count option should be tracked', async () => {
        client.setArgv('teams', 'list', '--count', '3');
        const exitCode = await teams(client);
        expect(exitCode, 'exit code for "teams"').toEqual(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          { key: 'subcommand:list', value: 'list' },
          { key: 'option:count', value: '[REDACTED]' },
        ]);
      });

      it('--since option should be tracked', async () => {
        client.setArgv('teams', 'list', '--since', '31584722256178');
        const exitCode = await teams(client);
        expect(exitCode, 'exit code for "teams"').toEqual(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          { key: 'subcommand:list', value: 'list' },
          { key: 'option:since', value: '[REDACTED]' },
        ]);
      });
    });

    describe('--format', () => {
      it('tracks telemetry for --format json', async () => {
        client.setArgv('teams', 'ls', '--format', 'json');
        const exitCode = await teams(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:list',
            value: 'ls',
          },
          {
            key: 'option:format',
            value: 'json',
          },
        ]);
      });

      it('outputs teams as valid JSON that can be piped to jq', async () => {
        client.setArgv('teams', 'ls', '--format', 'json');
        const exitCode = await teams(client);
        expect(exitCode).toEqual(0);

        const output = client.stdout.getFullOutput();
        // Should be valid JSON - this will throw if not parseable
        const jsonOutput = JSON.parse(output);

        expect(jsonOutput).toHaveProperty('teams');
        expect(Array.isArray(jsonOutput.teams)).toBe(true);
      });

      it.each([
        'pro',
        null,
      ])('outputs correct team structure in JSON with plan %s', async plan => {
        if (plan) {
          setTeamBillingPlan(plan);
        }
        client.setArgv('teams', 'ls', '--format', 'json');
        const exitCode = await teams(client);
        expect(exitCode).toEqual(0);

        const output = client.stdout.getFullOutput();
        const jsonOutput = JSON.parse(output);

        expect(jsonOutput.teams.length).toBeGreaterThan(0);
        const firstTeam = jsonOutput.teams[0];
        expect(firstTeam).toHaveProperty('id');
        expect(firstTeam).toHaveProperty('slug');
        expect(firstTeam).toHaveProperty('name');
        expect(firstTeam).toHaveProperty('plan', plan);
        expect(firstTeam).toHaveProperty('current');
      });
    });
  });

  describe('no teams visible to the credential', () => {
    // Regression test for a credential that only has personal-account scope
    // (e.g. a re-authorized OAuth grant with no team memberships visible to
    // the API). The API returns an empty/undefined teams array, which used
    // to crash `teams ls` with an unhandled
    // "Cannot read properties of undefined (reading 'value')" TypeError.
    it('prints a clear error and exits non-zero for an empty teams array on a northstar account', async () => {
      useUser({ version: 'northstar' });
      client.scenario.get('/v2/teams', (_req, res) => {
        res.json({ teams: [] });
      });

      client.setArgv('teams', 'ls');
      const exitCodePromise = teams(client);
      const exitCode = await exitCodePromise;

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toMatch(
        /no teams are visible to the current credential/i
      );
      expect(client.stderr.getFullOutput()).toMatch(/whoami/);
      // Never render a raw JS stack trace to the user.
      expect(client.stderr.getFullOutput()).not.toMatch(/TypeError/);
    });

    it('prints a clear error and exits non-zero when the API omits `teams` entirely', async () => {
      useUser({ version: 'northstar' });
      client.scenario.get('/v2/teams', (_req, res) => {
        // Simulate an unexpected/malformed API payload that omits `teams`.
        res.json({});
      });

      client.setArgv('teams', 'ls');
      const exitCode = await teams(client);

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toMatch(
        /no teams are visible to the current credential/i
      );
    });
  });

  describe('agent run with no team chosen', () => {
    it.each([
      'northstar',
      'legacy',
    ] as const)('marks nothing current for a %s account', async version => {
      useUser(version === 'northstar' ? { version } : {});
      useTeams(undefined, { apiVersion: 2 });
      client.isAgent = true;
      client.nonInteractive = true;
      client.ignoresSavedTeam = true;
      client.config.currentTeam = TEAM_NOT_CHOSEN;
      client.setArgv('teams', 'ls', '--format', 'json');

      const exitCode = await teams(client);

      expect(exitCode).toEqual(0);
      const { teams: listed } = JSON.parse(client.stdout.getFullOutput());
      expect(listed.length).toBeGreaterThan(0);
      for (const team of listed) {
        expect(team.current).toBe(false);
      }
    });
  });
  describe('--next cursor', () => {
    function usePagedTeams() {
      const queries: Record<string, unknown>[] = [];
      client.scenario.get('/v2/teams', (req, res) => {
        queries.push(req.query);
        res.json({
          teams: [{ id: 'team_1', slug: 'acme', name: 'Acme' }],
          pagination: { count: 1, next: 1584722256000 },
        });
      });
      return queries;
    }

    it.each([
      [['--next', '1584722256178']],
      [['--next=1584722256178']],
      [['-N', '1584722256178']],
    ])('sends %j to the API as the same timestamp as before', async args => {
      useUser();
      const queries = usePagedTeams();
      client.setArgv('teams', 'ls', ...args);

      expect(await teams(client)).toBe(0);
      expect(queries.at(-1)?.next).toBe('1584722256178');
      expect(client.stderr.getFullOutput()).toContain(
        '  Next page:\n    vercel teams ls --next 1584722256000\n'
      );
    });

    it('rejects a value that is not a cursor as a usage error', async () => {
      useUser();
      const queries = usePagedTeams();
      client.setArgv('teams', 'ls', '--next', 'oops');

      expect(await teams(client)).toBe(2);
      expect(queries).toHaveLength(0);
      expect(client.stderr.getFullOutput()).toContain(
        '--next must be the cursor printed with the previous page.'
      );
    });
  });
});
