import { describe, expect, it, beforeEach, vi } from 'vitest';
import { client } from '../../../mocks/client';
import teams from '../../../../src/commands/teams';
import { useUser } from '../../../mocks/user';
import { createTeam, useTeams } from '../../../mocks/team';

describe('teams update', () => {
  const currentTeamId = 'team_123';
  const team = createTeam(currentTeamId, 'team-slug', 'My Team');

  beforeEach(() => {
    useUser();
    useTeams(team.id);
    client.config = {
      currentTeam: currentTeamId,
    };
    client.nonInteractive = false;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('teams', 'update', '--help');
      const exitCodePromise = teams(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `teams:update`,
        },
      ]);
    });
  });

  it('updates the current team name with a sparse patch', async () => {
    let patchBody: Record<string, unknown> | undefined;
    client.scenario.patch(`/teams/${team.id}`, (req, res) => {
      patchBody = req.body as Record<string, unknown>;
      return res.json({ ...team, name: 'New Name' });
    });

    client.setArgv('teams', 'update', '--name', 'New Name');
    const exitCode = await teams(client);

    expect(exitCode).toBe(0);
    expect(patchBody).toEqual({ name: 'New Name' });
    await expect(client.stderr).toOutput('Updated');
    await expect(client.stderr).toOutput('New Name');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:update', value: 'update' },
      { key: 'option:name', value: '[REDACTED]' },
    ]);
  });

  it('updates multiple settings in one call and records enum telemetry', async () => {
    let patchBody: Record<string, unknown> | undefined;
    client.scenario.patch(`/teams/${team.id}`, (req, res) => {
      patchBody = req.body as Record<string, unknown>;
      return res.json(team);
    });

    client.setArgv(
      'teams',
      'update',
      '--toolbar',
      'on',
      '--default-build-machine',
      'enhanced'
    );
    const exitCode = await teams(client);

    expect(exitCode).toBe(0);
    expect(patchBody).toEqual({
      enablePreviewFeedback: 'on',
      resourceConfig: { buildMachine: { default: 'enhanced' } },
    });

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:update', value: 'update' },
      { key: 'option:toolbar', value: 'on' },
      { key: 'option:default-build-machine', value: 'enhanced' },
    ]);
  });

  it('forwards a non-empty preview suffix in the request body', async () => {
    let patchBody: Record<string, unknown> | undefined;
    client.scenario.patch(`/teams/${team.id}`, (req, res) => {
      patchBody = req.body as Record<string, unknown>;
      return res.json(team);
    });

    client.setArgv('teams', 'update', '--preview-suffix', 'example.dev');
    const exitCode = await teams(client);

    expect(exitCode).toBe(0);
    expect(patchBody).toEqual({ previewDeploymentSuffix: 'example.dev' });
  });

  it('clears the preview suffix when passed an empty string', async () => {
    let patchBody: Record<string, unknown> | undefined;
    client.scenario.patch(`/teams/${team.id}`, (req, res) => {
      patchBody = req.body as Record<string, unknown>;
      return res.json(team);
    });

    client.setArgv('teams', 'update', '--preview-suffix', '');
    const exitCode = await teams(client);

    expect(exitCode).toBe(0);
    expect(patchBody).toEqual({ previewDeploymentSuffix: null });
  });

  it('rejects an invalid --toolbar value before calling the API', async () => {
    let called = false;
    client.scenario.patch(`/teams/${team.id}`, (_req, res) => {
      called = true;
      return res.json(team);
    });

    client.setArgv('teams', 'update', '--toolbar', 'bogus');
    const exitCode = await teams(client);

    expect(exitCode).toBe(1);
    expect(called).toBe(false);
    await expect(client.stderr).toOutput('must be one of on, off, default');
  });

  it('errors when no settings are provided', async () => {
    client.setArgv('teams', 'update');
    const exitCode = await teams(client);

    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('No settings to update');
  });

  it('targets a team by slug positional argument', async () => {
    const other = createTeam('team_other', 'other-co', 'Other Co');
    let patchedId: string | undefined;
    client.scenario.patch(`/teams/${other.id}`, (req, res) => {
      patchedId = other.id;
      return res.json({ ...other, name: 'Renamed' });
    });

    client.setArgv('teams', 'update', 'other-co', '--name', 'Renamed');
    const exitCode = await teams(client);

    expect(exitCode).toBe(0);
    expect(patchedId).toBe('team_other');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:update', value: 'update' },
      { key: 'argument:team-slug', value: '[REDACTED]' },
      { key: 'option:name', value: '[REDACTED]' },
    ]);
  });

  it('errors for an unknown team slug', async () => {
    client.setArgv('teams', 'update', 'nope', '--name', 'X');
    const exitCode = await teams(client);

    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('do not have access');
  });

  describe('--slug confirmation', () => {
    it('asks for confirmation and applies the change when accepted', async () => {
      let patchBody: Record<string, unknown> | undefined;
      client.scenario.patch(`/teams/${team.id}`, (req, res) => {
        patchBody = req.body as Record<string, unknown>;
        return res.json({ ...team, slug: 'new-slug' });
      });

      client.setArgv('teams', 'update', '--slug', 'new-slug');
      const exitCodePromise = teams(client);

      await expect(client.stderr).toOutput('Change the team URL');
      client.stdin.write('y\n');

      await expect(exitCodePromise).resolves.toEqual(0);
      expect(patchBody).toEqual({ slug: 'new-slug' });
    });

    it('cancels without changes when declined', async () => {
      let called = false;
      client.scenario.patch(`/teams/${team.id}`, (_req, res) => {
        called = true;
        return res.json(team);
      });

      client.setArgv('teams', 'update', '--slug', 'new-slug');
      const exitCodePromise = teams(client);

      await expect(client.stderr).toOutput('Change the team URL');
      client.stdin.write('n\n');

      await expect(exitCodePromise).resolves.toEqual(0);
      expect(called).toBe(false);
      await expect(client.stderr).toOutput('Canceled');
    });

    it('skips the prompt when --yes is passed', async () => {
      let patchBody: Record<string, unknown> | undefined;
      client.scenario.patch(`/teams/${team.id}`, (req, res) => {
        patchBody = req.body as Record<string, unknown>;
        return res.json({ ...team, slug: 'new-slug' });
      });

      client.setArgv('teams', 'update', '--slug', 'new-slug', '--yes');
      const exitCode = await teams(client);

      expect(exitCode).toBe(0);
      expect(patchBody).toEqual({ slug: 'new-slug' });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:update', value: 'update' },
        { key: 'option:slug', value: '[REDACTED]' },
        { key: 'flag:yes', value: 'TRUE' },
      ]);
    });
  });

  describe('non-interactive mode', () => {
    it('requires --yes to change the slug', async () => {
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('teams', 'update', '--slug', 'new-slug');
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('confirmation_required');
      expect(payload.next[0].command).toContain('--yes');

      logSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('outputs error JSON when no settings are provided', async () => {
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('teams', 'update');
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('missing_arguments');

      logSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('outputs error JSON for an invalid enum value', async () => {
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('teams', 'update', '--default-build-machine', 'nope');
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_default_build_machine');
      expect(payload.message).toContain('default-build-machine');

      logSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });

  describe('policy flags', () => {
    it('maps --require-verified-commits and --sensitive-env-policy', async () => {
      let patchBody: Record<string, unknown> | undefined;
      client.scenario.patch(`/teams/${team.id}`, (req, res) => {
        patchBody = req.body as Record<string, unknown>;
        return res.json(team);
      });

      client.setArgv(
        'teams',
        'update',
        '--require-verified-commits',
        'on',
        '--sensitive-env-policy',
        'default'
      );
      const exitCode = await teams(client);

      expect(exitCode).toBe(0);
      expect(patchBody).toEqual({
        requireVerifiedCommits: true,
        sensitiveEnvironmentVariablePolicy: 'default',
      });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:update', value: 'update' },
        { key: 'option:require-verified-commits', value: 'on' },
        { key: 'option:sensitive-env-policy', value: 'default' },
      ]);
    });

    it('inverts --ip-visibility into hideIpAddresses', async () => {
      let patchBody: Record<string, unknown> | undefined;
      client.scenario.patch(`/teams/${team.id}`, (req, res) => {
        patchBody = req.body as Record<string, unknown>;
        return res.json(team);
      });

      client.setArgv('teams', 'update', '--ip-visibility', 'off');
      const exitCode = await teams(client);

      expect(exitCode).toBe(0);
      expect(patchBody).toEqual({ hideIpAddresses: true });
    });

    it('sends deploymentPolicy rules from JSON policy flags', async () => {
      let patchBody: Record<string, unknown> | undefined;
      client.scenario.patch(`/teams/${team.id}`, (req, res) => {
        patchBody = req.body as Record<string, unknown>;
        return res.json(team);
      });

      const rule = {
        enabled: true,
        environments: [{ type: 'system', target: 'production' }],
        sources: ['git', 'cli'],
      };
      client.setArgv(
        'teams',
        'update',
        '--deployment-source-policy',
        JSON.stringify([rule]),
        '--git-source-policy',
        'null'
      );
      const exitCode = await teams(client);

      expect(exitCode).toBe(0);
      expect(patchBody).toEqual({
        deploymentPolicy: {
          gitSources: null,
          deploymentSources: [rule],
        },
      });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:update', value: 'update' },
        { key: 'option:git-source-policy', value: '[REDACTED]' },
        { key: 'option:deployment-source-policy', value: '[REDACTED]' },
      ]);
    });

    it('rejects malformed policy JSON before calling the API', async () => {
      let called = false;
      client.scenario.patch(`/teams/${team.id}`, (_req, res) => {
        called = true;
        return res.json(team);
      });

      client.setArgv('teams', 'update', '--git-source-policy', '{not json');
      const exitCode = await teams(client);

      expect(exitCode).toBe(1);
      expect(called).toBe(false);
      await expect(client.stderr).toOutput('must be a JSON array of rules');
    });

    it('rejects policy rules missing required fields', async () => {
      client.setArgv(
        'teams',
        'update',
        '--deployment-source-policy',
        JSON.stringify([{ enabled: true }])
      );
      const exitCode = await teams(client);

      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('must be a JSON array of rules');
    });

    it('rejects an invalid --require-verified-commits value', async () => {
      client.setArgv('teams', 'update', '--require-verified-commits', 'yes');
      const exitCode = await teams(client);

      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('must be one of on, off');
    });

    it('outputs error JSON for invalid --ip-visibility in non-interactive mode', async () => {
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('teams', 'update', '--ip-visibility', 'visible');
      await expect(teams(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_ip_visibility');

      logSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });
});
