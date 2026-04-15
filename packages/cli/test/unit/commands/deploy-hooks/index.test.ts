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
      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'deploy-hooks' },
      ]);
    });

    it('tracks telemetry for create --help', async () => {
      client.setArgv('deploy-hooks', 'create', '--help');
      const exitCode = await deployHooks(client);
      expect(exitCode).toEqual(2);
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

    it('POSTs deploy hook and prints JSON in non-interactive mode', async () => {
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
        '--ref',
        'staging',
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
    });

    it('errors in non-interactive mode when --ref is missing', async () => {
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

      await expect(deployHooks(client)).rejects.toThrow('exit:1');
      const payload = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0] as string
      );
      expect(payload.status).toBe('error');
      expect(payload.message).toMatch(/--ref/i);
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
  });
});
