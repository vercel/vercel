import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import integrationCommand from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import { useConfiguration } from '../../../mocks/integration';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { expectDeprecationInJson } from '../../../helpers/deprecation-warning';

describe('integration', () => {
  describe('update', () => {
    let team: Team;
    beforeEach(() => {
      useUser();
      const teams = useTeams('team_dummy');
      team = Array.isArray(teams) ? teams[0] : teams.teams[0];
      client.config.currentTeam = team.id;
      useConfiguration();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      client.nonInteractive = false;
    });

    it('updates project access with --projects all', async () => {
      let patchedBody: unknown;
      client.scenario.patch(
        '/v1/integrations/configuration/:id',
        (req, res) => {
          expect(req.params.id).toBe('acme-first');
          patchedBody = req.body;
          res.status(200).json({});
        }
      );

      client.setArgv(
        'integration',
        'update',
        'acme-no-projects',
        '--projects',
        'all'
      );
      const code = await integrationCommand(client);
      expect(code).toBe(0);
      expect(patchedBody).toEqual({ projects: 'all' });
      await expect(client.stderr).toOutput('installation updated successfully');
    });

    it('updates billing plan with --plan', async () => {
      let patchedBody: unknown;
      client.scenario.patch(
        '/v1/integrations/configuration/:id',
        (req, res) => {
          expect(req.params.id).toBe('acme-first');
          patchedBody = req.body;
          res.status(200).json({});
        }
      );

      client.setArgv(
        'integration',
        'update',
        'acme-no-projects',
        '--plan',
        'pro',
        '--authorization-id',
        'auth_123'
      );
      const code = await integrationCommand(client);
      expect(code).toBe(0);
      expect(patchedBody).toEqual({
        billingPlanId: 'pro',
        authorizationId: 'auth_123',
      });
    });

    it('outputs JSON on success when --non-interactive even without --format', async () => {
      client.nonInteractive = true;
      client.scenario.patch(
        '/v1/integrations/configuration/:id',
        (_req, res) => {
          res.status(200).json({});
        }
      );

      client.setArgv(
        'integration',
        'update',
        'acme-no-projects',
        '--projects',
        'all',
        '--non-interactive'
      );
      const code = await integrationCommand(client);
      expect(code).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput().trim());
      expect(out).toMatchObject({
        integration: 'acme-no-projects',
        configurationId: 'acme-first',
        updated: true,
        projects: 'all',
      });
    });

    it('outputs JSON when --format=json', async () => {
      client.scenario.patch(
        '/v1/integrations/configuration/:id',
        (_req, res) => {
          res.status(200).json({});
        }
      );

      client.setArgv(
        'integration',
        'update',
        'acme-no-projects',
        '--projects',
        'all',
        '--format',
        'json'
      );
      const code = await integrationCommand(client);
      expect(code).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput().trim());
      expect(out).toMatchObject({
        integration: 'acme-no-projects',
        configurationId: 'acme-first',
        updated: true,
        projects: 'all',
      });
    });

    it('errors when multiple installations exist without --installation-id', async () => {
      client.setArgv(
        'integration',
        'update',
        'acme-multi',
        '--projects',
        'all'
      );
      const code = await integrationCommand(client);
      expect(code).toBe(1);
      await expect(client.stderr).toOutput('Multiple installations found');
    });

    it('selects installation with --installation-id', async () => {
      let patchedId: string | undefined;
      client.scenario.patch(
        '/v1/integrations/configuration/:id',
        (req, res) => {
          patchedId = req.params.id;
          res.status(200).json({});
        }
      );

      client.setArgv(
        'integration',
        'update',
        'acme-multi',
        '--installation-id',
        'icfg_install_b',
        '--projects',
        'all'
      );
      const code = await integrationCommand(client);
      expect(code).toBe(0);
      expect(patchedId).toBe('icfg_install_b');
    });

    it('errors when integration slug is missing but --projects was passed first', async () => {
      client.setArgv('integration', 'update', '--projects', 'all');
      const code = await integrationCommand(client);
      expect(code).toBe(2);
      await expect(client.stderr).toOutput('immediately after `update`');
    });

    it('errors when integration slug is missing with no subcommand flags', async () => {
      client.setArgv('integration', 'update');
      const code = await integrationCommand(client);
      expect(code).toBe(2);
      await expect(client.stderr).toOutput('integration slug after `update`');
    });

    it('writes structured JSON error to stdout when non-interactive and integration slug is missing', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);
      client.nonInteractive = true;
      client.setArgv(
        'integration',
        'update',
        '--non-interactive',
        '--cwd',
        '/tmp/example'
      );
      await expect(integrationCommand(client)).rejects.toThrow('exit:2');
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_arguments',
      });
      expect(payload.message).toMatch(/integration slug/i);
      expect(payload.next?.[0]?.command).toMatch(
        /vercel --non-interactive --cwd \/tmp\/example integration update neon --projects all$/
      );
      expect(payload.next?.[1]?.command).toBe(
        'vercel --non-interactive --cwd /tmp/example integration installations'
      );
    });

    it('when --projects is given without a slug, explains argument order in JSON', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);
      client.nonInteractive = true;
      client.setArgv(
        'integration',
        'update',
        '--projects',
        'all',
        '--cwd',
        '/tmp/example',
        '--non-interactive'
      );
      await expect(integrationCommand(client)).rejects.toThrow('exit:2');
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload.reason).toBe('missing_arguments');
      expect(payload.message).toMatch(/immediately after `update`/i);
      expect(payload.hint).toMatch(/integration name/i);
      expect(payload.next?.[0]?.command).toMatch(
        /vercel --cwd \/tmp\/example --non-interactive integration update neon --projects all$/
      );
    });

    it('errors when --plan and --projects are combined', async () => {
      client.setArgv(
        'integration',
        'update',
        'acme-no-projects',
        '--plan',
        'pro',
        '--projects',
        'all'
      );
      const code = await integrationCommand(client);
      expect(code).toBe(2);
      await expect(client.stderr).toOutput(
        'either --billing-plan or --projects'
      );
    });
  });
});

describe('integration update renamed options', () => {
  // Runs `integration update` with a fresh client, recording the update.
  async function run(...args: string[]) {
    client.reset();
    useUser({ id: 'user_1', username: 'tester' });
    const teams = useTeams('team_dummy');
    const team = Array.isArray(teams) ? teams[0] : teams.teams[0];
    client.config.currentTeam = team.id;
    useConfiguration();
    let patched: { id: string; body: unknown } | undefined;
    client.scenario.patch('/v1/integrations/configuration/:id', (req, res) => {
      patched = { id: req.params.id, body: req.body };
      res.status(200).json({});
    });
    client.setArgv('integration', 'update', 'acme-no-projects', ...args);
    const exitCode = await integrationCommand(client);
    return {
      exitCode,
      patched,
      stdout: client.stdout.getFullOutput(),
      stderr: client.stderr.getFullOutput(),
    };
  }

  it.each([
    ['--plan', '--billing-plan', ['--plan', 'pro'], ['--billing-plan', 'pro']],
    ['-p', '--billing-plan', ['-p', 'pro'], ['--billing-plan', 'pro']],
    [
      '--authorization-id',
      '--authorization',
      ['--billing-plan', 'pro', '--authorization-id', 'auth_1'],
      ['--billing-plan', 'pro', '--authorization', 'auth_1'],
    ],
    [
      '--installation-id',
      '--installation',
      ['--installation-id', 'acme-first', '--projects', 'all'],
      ['--installation', 'acme-first', '--projects', 'all'],
    ],
  ])('still accepts %s, with one warning that names %s', async (typed, name, oldArgs, newArgs) => {
    const now = await run(...newArgs);
    const before = await run(...oldArgs);

    expect(now.exitCode).toBe(0);
    expect(now.stderr).not.toContain('deprecated');
    expect(before.exitCode).toBe(now.exitCode);
    expect(before.patched).toEqual(now.patched);
    expect(before.stdout).toBe(now.stdout);
    expect(before.stderr.match(/deprecated/g)).toHaveLength(1);
    expect(before.stderr).toContain(`! ${typed} is deprecated. Use ${name}.\n`);

    const nowJson = await run(...newArgs, '--json');
    const beforeJson = await run(...oldArgs, '--json');
    expectDeprecationInJson(
      beforeJson.stdout,
      nowJson.stdout,
      `${typed} is deprecated. Use ${name}.`
    );
    expect(beforeJson.stderr).not.toContain('deprecated');
  });

  it('sends the plan and authorization given with the new names', async () => {
    const result = await run(
      '--billing-plan',
      'pro',
      '--authorization',
      'auth_1'
    );

    expect(result.patched).toEqual({
      id: 'acme-first',
      body: { billingPlanId: 'pro', authorizationId: 'auth_1' },
    });
  });

  it.each([
    [
      ['--billing-plan', 'pro', '--plan', 'pro'],
      "Can't use --billing-plan with --plan.",
    ],
    [
      ['--billing-plan', 'pro', '-p', 'pro'],
      "Can't use --billing-plan with -p.",
    ],
    [
      [
        '--billing-plan',
        'pro',
        '--authorization',
        'a',
        '--authorization-id',
        'a',
      ],
      "Can't use --authorization with --authorization-id.",
    ],
    [
      ['--projects', 'all', '--installation', 'x', '--installation-id', 'x'],
      "Can't use --installation with --installation-id.",
    ],
  ])('rejects %j before any request', async (args, message) => {
    const result = await run(...args);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(message);
    expect(result.patched).toBeUndefined();
  });
});
