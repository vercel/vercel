import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import security from '../../../../src/commands/security';
import type { SecurityDashboardResponse } from '../../../../src/commands/security/types';

function useTeamScope() {
  useUser();
  useTeams('team_dummy');
  client.config.currentTeam = 'team_dummy';
}

function useReport(
  report: SecurityDashboardResponse['report'],
  mutes?: SecurityDashboardResponse['mutes'],
  onQuery?: (query: URLSearchParams) => void
) {
  client.scenario.get('/dashboard/security-dashboard', (req, res) => {
    onQuery?.(new URLSearchParams(req.query as Record<string, string>));
    res.json({ report, ...(mutes ? { mutes } : {}) });
  });
}

const passingPosture = {
  violationsCount: 0,
  samples: [],
};

const failingPosture = {
  violationsCount: 2,
  samples: [
    { id: 'tok_1', label: 'ci-token' },
    { id: 'tok_2', label: 'deploy-token' },
  ],
};

describe('security', () => {
  beforeEach(() => {
    client.reset();
  });

  describe('check', () => {
    it('renders the summary table', async () => {
      useTeamScope();
      useReport({
        'pats-no-expiration': failingPosture,
        'depl-no-git-fork-protection': passingPosture,
      });
      client.setArgv('security', 'check');
      const exitCode = await security(client);
      expect(exitCode, 'exit code for "security check"').toEqual(0);
      await expect(client.stderr).toOutput(
        '9 checks · 1 failing · 7 unavailable · 1 passing'
      );
      await expect(client.stderr).toOutput('pats-no-expiration');
      await expect(client.stderr).toOutput(
        'Run with --findings to list individual findings.'
      );
    });

    it('shows muted status for facet-muted checks', async () => {
      useTeamScope();
      useReport({
        'pats-no-expiration': {
          violationsCount: 0,
          samples: [],
          unavailable: true,
          unavailableReason: 'muted',
        },
      });
      client.setArgv('security', 'check');
      const exitCode = await security(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('muted');
    });

    it('lists findings with --findings, including muted ones', async () => {
      useTeamScope();
      useReport({ 'pats-no-expiration': failingPosture }, [
        {
          facet: 'pats-no-expiration',
          entityId: 'tok_3',
          labelSnapshot: { label: 'old-token' },
        },
      ]);
      client.setArgv('security', 'check', '--findings');
      const exitCode = await security(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('ci-token');
      await expect(client.stderr).toOutput('old-token (muted)');
    });

    it('passes check slugs and --limit through as facets and maxSamples', async () => {
      useTeamScope();
      let query: URLSearchParams | undefined;
      useReport({ 'pats-no-expiration': failingPosture }, undefined, q => {
        query = q;
      });
      client.setArgv(
        'security',
        'check',
        'pats-no-expiration',
        '--limit',
        '50'
      );
      const exitCode = await security(client);
      expect(exitCode).toEqual(0);
      expect(query?.get('facets')).toEqual('pats-no-expiration');
      expect(query?.get('maxSamples')).toEqual('50');
      // a named check implies --findings
      await expect(client.stderr).toOutput('ci-token');
    });

    it('rejects unknown checks before fetching', async () => {
      useTeamScope();
      client.setArgv('security', 'check', 'not-a-check');
      const exitCode = await security(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Unknown check: not-a-check. Valid slugs:'
      );
    });

    it('outputs the raw response with --json', async () => {
      useTeamScope();
      useReport({ 'pats-no-expiration': failingPosture });
      client.setArgv('security', 'check', '--json');
      const exitCode = await security(client);
      expect(exitCode).toEqual(0);
      await expect(client.stdout).toOutput('"pats-no-expiration"');
    });

    it('outputs the JSON report on stdout when non-interactive', async () => {
      useTeamScope();
      useReport({ 'pats-no-expiration': failingPosture });
      client.nonInteractive = true;
      client.setArgv('security', 'check');
      const exitCode = await security(client);
      expect(exitCode).toEqual(0);
      await expect(client.stdout).toOutput('"pats-no-expiration"');
    });

    it('emits a structured error payload when non-interactive', async () => {
      useTeamScope();
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);
      client.nonInteractive = true;
      client.setArgv('security', 'check', 'not-a-check');
      await security(client);
      expect(exitSpy).toHaveBeenCalledWith(1);
      await expect(client.stdout).toOutput('"reason": "invalid_arguments"');
      exitSpy.mockRestore();
    });

    it('tracks subcommand invocation', async () => {
      useTeamScope();
      useReport({});
      client.setArgv('security', 'check');
      const exitCode = await security(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:check',
          value: 'check',
        },
      ]);
    });
  });
});
