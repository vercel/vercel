import { describe, it, expect, vi, afterEach } from 'vitest';
import deployHooks from '../../../../src/commands/deploy-hooks';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';

const gitLink = {
  type: 'github' as const,
  repo: 'user/repo',
  repoId: 1010,
  org: 'acme',
  gitCredentialId: '',
  sourceless: true,
  createdAt: 1,
  updatedAt: 1,
  productionBranch: 'main',
};

describe('deploy-hooks', () => {
  describe('--help', () => {
    it('tracks telemetry for top-level help', async () => {
      client.setArgv('deploy-hooks', '--help');
      const exitCode = await deployHooks(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'deploy-hooks' },
      ]);
    });

    it('tracks telemetry for create --help', async () => {
      client.setArgv('deploy-hooks', 'create', '--help');
      const exitCode = await deployHooks(client);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'deploy-hooks:create' },
      ]);
    });
  });

  describe('list', () => {
    it('prints deploy hooks from the linked project', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'hooked',
        link: {
          ...gitLink,
          deployHooks: [
            {
              id: 'hk_1',
              name: 'CMS',
              ref: 'main',
              url: 'https://api.vercel.com/v1/integrations/deploy/foo/hk_1',
              createdAt: 1000,
            },
          ],
        },
      });

      client.setArgv('deploy-hooks', 'ls', '--project', 'hooked');
      const exitCode = await deployHooks(client);
      expect(exitCode).toEqual(0);
      expect(client.stderr.getFullOutput()).toContain('CMS');
      expect(client.stderr.getFullOutput()).toContain('hk_1');
    });
  });

  describe('create', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each([
      ['--git-branch', undefined],
      ['--git-branch=', undefined],
      ['--ref', '--ref'],
      ['-r', '-r'],
    ])('POSTs deploy hook with %s and prints JSON in non-interactive mode', async (flag, deprecated) => {
      useUser();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        name: 'p',
        id: 'prj_hook',
        link: {
          ...gitLink,
          deployHooks: [],
        },
      });

      client.scenario.post(
        `/v2/projects/${project.id}/deploy-hooks`,
        (req, res) => {
          expect(req.body).toEqual({ name: 'from-ci', ref: 'staging' });
          res.json({
            ...project,
            link: {
              ...gitLink,
              deployHooks: [
                {
                  id: 'hk_new',
                  name: 'from-ci',
                  ref: 'staging',
                  url: 'https://api.vercel.com/v1/integrations/deploy/prj_hook/hk_new',
                  createdAt: 2000,
                },
              ],
            },
          });
        }
      );

      client.setArgv(
        'deploy-hooks',
        'create',
        'from-ci',
        ...(flag.endsWith('=') ? [`${flag}staging`] : [flag, 'staging']),
        '--project',
        project.name!,
        '--non-interactive'
      );
      client.nonInteractive = true;

      const exitCode = await deployHooks(client);
      expect(exitCode).toEqual(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('ok');
      expect(payload.hook.id).toBe('hk_new');
      expect(payload.hook.url).toContain('hk_new');
      if (deprecated) {
        expect(client.stderr.getFullOutput()).toContain(
          `! ${deprecated} is deprecated. Use --git-branch.`
        );
      } else {
        expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      }
    });

    it('rejects --ref with --git-branch before creating a hook', async () => {
      useUser();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        name: 'p',
        link: { ...gitLink, deployHooks: [] },
      });
      let created = false;
      client.scenario.post(
        `/v2/projects/${project.id}/deploy-hooks`,
        (_req, res) => {
          created = true;
          res.json(project);
        }
      );

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as () => never);

      client.setArgv(
        'deploy-hooks',
        'create',
        'both',
        '--ref',
        'main',
        '--git-branch',
        'main',
        '--project',
        'p',
        '--non-interactive'
      );
      client.nonInteractive = true;

      await expect(deployHooks(client)).rejects.toThrow('exit:2');
      expect(created).toBe(false);
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        status: 'error',
        reason: 'invalid_arguments',
        message: "Can't use --ref with --git-branch. Use --git-branch.",
      });
    });

    it('rejects -r with --git-branch in human mode', async () => {
      client.setArgv(
        'deploy-hooks',
        'create',
        'both',
        '-r',
        'main',
        '--git-branch',
        'main'
      );

      const exitCode = await deployHooks(client);
      expect(exitCode).toEqual(2);
      expect(client.stderr.getFullOutput()).toContain(
        "Can't use -r with --git-branch. Use --git-branch."
      );
    });

    it('tracks telemetry without the hook name or branch', async () => {
      client.setArgv(
        'deploy-hooks',
        'create',
        'secret-hook',
        '--ref',
        'secret-ref',
        '--git-branch',
        'secret-branch'
      );

      await deployHooks(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:create', value: 'create' },
        { key: 'argument:name', value: '[REDACTED]' },
        { key: 'option:git-branch', value: '[REDACTED]' },
        { key: 'option:ref', value: '[REDACTED]' },
      ]);
    });

    it('errors in non-interactive mode when --git-branch is missing', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'p',
        link: { ...gitLink, deployHooks: [] },
      });

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as () => never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      client.setArgv(
        'deploy-hooks',
        'create',
        'noref',
        '--project',
        'p',
        '--non-interactive'
      );
      client.nonInteractive = true;

      await expect(deployHooks(client)).rejects.toThrow('exit:2');
      const payload = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0] as string
      );
      expect(payload.status).toBe('error');
      expect(payload.message).toContain('Pass `--git-branch <BRANCH>`.');
      expect(payload.next[0].command).toContain(
        'deploy-hooks create noref --git-branch <BRANCH>'
      );
      expect(JSON.stringify(payload)).not.toContain('--ref');
    });
  });

  describe('remove', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('DELETEs deploy hook with --yes in non-interactive mode', async () => {
      useUser();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        name: 'p',
        link: {
          ...gitLink,
          deployHooks: [
            {
              id: 'hk_del',
              name: 'x',
              ref: 'main',
              url: 'https://example.com',
              createdAt: 1,
            },
          ],
        },
      });

      let deleted = false;
      client.scenario.delete(
        `/v2/projects/${project.id}/deploy-hooks/hk_del`,
        (_req, res) => {
          deleted = true;
          res.status(204).end();
        }
      );

      client.setArgv(
        'deploy-hooks',
        'rm',
        'hk_del',
        '--project',
        project.name!,
        '--yes',
        '--non-interactive'
      );
      client.nonInteractive = true;

      const exitCode = await deployHooks(client);
      expect(exitCode).toEqual(0);
      expect(deleted).toBe(true);
    });

    it.each([
      ['delete', false],
      ['del', false],
      ['remove', true],
    ])('runs as %s (deprecated: %s)', async (name, deprecated) => {
      useUser();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        name: 'p',
        link: {
          ...gitLink,
          deployHooks: [
            {
              id: 'hk_del',
              name: 'x',
              ref: 'main',
              url: 'https://example.com',
              createdAt: 1,
            },
          ],
        },
      });
      client.scenario.delete(
        `/v2/projects/${project.id}/deploy-hooks/hk_del`,
        (_req, res) => {
          res.status(204).end();
        }
      );

      client.setArgv(
        'deploy-hooks',
        name,
        'hk_del',
        '--project',
        project.name!,
        '--yes',
        '--non-interactive'
      );
      client.nonInteractive = true;

      const exitCode = await deployHooks(client);
      expect(exitCode).toEqual(0);
      const warning =
        '`vercel deploy-hooks remove` is deprecated. Use `vercel deploy-hooks delete`.';
      if (deprecated) {
        expect(client.stderr.getFullOutput()).toContain(warning);
      } else {
        expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
      }
    });
  });
});
