import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import curl from '../../../../src/commands/curl';
import { resolveDeployment } from '../../../../src/commands/curl/resolve-deployment';
import { client } from '../../../mocks/client';
import { createTeam, useTeams } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { useUser } from '../../../mocks/user';
import { introspectToken } from '../../../../src/util/introspect-token';

vi.mock('child_process', () => ({ spawn: vi.fn() }));
vi.mock('../../../../src/util/introspect-token', () => ({
  introspectToken: vi.fn(),
}));

const hostname = 'protected-target.vercel.app';
const deploymentId = 'dpl_target';
const projectId = 'prj_target';
const ownerId = 'team_target';

beforeEach(() => {
  vi.clearAllMocks();
  client.cwd = setupTmpDir();
  vi.mocked(spawn).mockReturnValue({
    on: vi.fn((event, handler) => {
      if (event === 'close') setTimeout(() => handler(0), 0);
    }),
  } as any);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function protectedDeployment({
  publicMetadata = false,
  teamOnly = false,
} = {}) {
  const attempts: (string | undefined)[] = [];
  client.scenario.get('/v13/deployments/:selector', (req, res) => {
    expect([hostname, deploymentId]).toContain(req.params.selector);
    const teamId = req.query.teamId as string | undefined;
    attempts.push(teamId);
    if (teamId !== ownerId) {
      if (!teamId && publicMetadata) {
        return res.json({ id: deploymentId, url: hostname });
      }
      return res.status(404).json({ error: { code: 'not_found' } });
    }
    res.json({
      id: deploymentId,
      url: hostname,
      projectId,
      ...(teamOnly ? { team: { id: ownerId } } : { ownerId }),
    });
  });
  client.scenario.get(`/v9/projects/${projectId}`, (req, res) => {
    expect(req.query.teamId).toBe(ownerId);
    res.json({
      id: projectId,
      name: 'target',
      protectionBypass: { 'target-secret': { scope: 'automation-bypass' } },
    });
  });
  return attempts;
}

describe('automatic team discovery', () => {
  it("uses an app token's bound team without requiring team listing", async () => {
    vi.stubEnv('APP_PRINCIPAL_ENABLED', '1');
    client.config.currentTeam = 'team_wrong';
    client.scenario.get('/v2/user', (_req, res) =>
      res.status(403).json({ error: { code: 'forbidden' } })
    );
    vi.mocked(introspectToken).mockResolvedValue({
      active: true,
      client_id: 'cl_test',
      team: { id: ownerId },
    });
    const fetch = vi.spyOn(client, 'fetch');
    const attempts = protectedDeployment();
    client.setArgv('curl', `https://${hostname}/api/hello`);

    expect(await curl(client)).toBe(0);
    expect(attempts).toEqual([undefined, ownerId]);
    expect(fetch.mock.calls.some(([url]) => url === '/v1/teams')).toBe(false);
    expect(vi.mocked(spawn).mock.calls[0][1]).toContain(
      'x-vercel-protection-bypass: target-secret'
    );
    expect(client.config.currentTeam).toBe('team_wrong');
  });

  it('continues discovering teams for a user token when app principals are enabled', async () => {
    vi.stubEnv('APP_PRINCIPAL_ENABLED', '1');
    useUser();
    useTeams(ownerId);
    const attempts = protectedDeployment();
    client.setArgv('curl', `https://${hostname}/api/hello`);

    expect(await curl(client)).toBe(0);
    expect(attempts).toEqual([undefined, ownerId]);
    expect(introspectToken).not.toHaveBeenCalled();
  });

  it('retains the selected team for credentials that cannot list teams', async () => {
    client.config.currentTeam = ownerId;
    client.scenario.get('/v1/teams', (_req, res) =>
      res.status(403).json({ error: { code: 'forbidden' } })
    );
    const attempts = protectedDeployment();
    client.setArgv('curl', `https://${hostname}/api/hello`);

    expect(await curl(client)).toBe(0);
    expect(attempts).toEqual([undefined, ownerId]);
    expect(vi.mocked(spawn).mock.calls[0][1]).toContain(
      'x-vercel-protection-bypass: target-secret'
    );
  });

  it('uses a public deployment URL with a supplied bypass when teams cannot be listed', async () => {
    client.scenario.get('/v1/teams', (_req, res) =>
      res.status(403).json({ error: { code: 'forbidden' } })
    );
    protectedDeployment({ publicMetadata: true });
    client.setArgv(
      'curl',
      '/api/hello',
      '--deployment',
      deploymentId,
      '--protection-bypass',
      'caller-secret'
    );

    expect(await curl(client)).toBe(0);
    expect(vi.mocked(spawn).mock.calls[0][1]).toContain(
      'x-vercel-protection-bypass: caller-secret'
    );
  });

  for (const currentTeam of [undefined, 'team_wrong', 'team_deleted']) {
    it.each([
      ['URL', [`https://${hostname}/api/hello`]],
      ['deployment URL', ['/api/hello', '--deployment', `https://${hostname}`]],
      ['deployment ID', ['/api/hello', '--deployment', deploymentId]],
    ])(
      'authenticates a %s with current team ' + currentTeam,
      async (_, args) => {
        useTeams('team_wrong');
        createTeam(ownerId);
        client.config.currentTeam = currentTeam;
        const attempts = protectedDeployment();
        client.setArgv('curl', ...args);

        expect(await curl(client)).toBe(0);
        expect(attempts).toEqual([undefined, 'team_wrong', ownerId]);
        expect(spawn).toHaveBeenCalledWith(
          'curl',
          expect.arrayContaining([
            '--url',
            `https://${hostname}/api/hello`,
            '--header',
            'x-vercel-protection-bypass: target-secret',
          ]),
          expect.any(Object)
        );
        expect(client.config.currentTeam).toBe(currentTeam);
        expect(existsSync(join(client.cwd, '.vercel'))).toBe(false);
      }
    );
  }

  it('keeps searching when the unscoped response contains only public metadata', async () => {
    useTeams(ownerId);
    const attempts = protectedDeployment({
      publicMetadata: true,
      teamOnly: true,
    });
    client.setArgv('curl', `https://${hostname}/api/hello`);

    expect(await curl(client)).toBe(0);
    expect(attempts).toEqual([undefined, ownerId]);
    expect(vi.mocked(spawn).mock.calls[0][1]).toContain(
      'x-vercel-protection-bypass: target-secret'
    );
  });

  it('skips SSO-limited teams even when one is the current team', async () => {
    const [limited] = useTeams('team_limited') as ReturnType<
      typeof createTeam
    >[];
    Object.assign(limited, { limited: true });
    createTeam(ownerId);
    client.config.currentTeam = limited.id;
    const attempts = protectedDeployment();
    client.setArgv('curl', `https://${hostname}/api/hello`);

    expect(await curl(client)).toBe(0);
    expect(attempts).toEqual([undefined, ownerId]);
  });

  it.each(['flag', 'env'])('uses %s bypass with an ID', async source => {
    useTeams(ownerId);
    client.config.currentTeam = 'team_deleted';
    const attempts = protectedDeployment();
    const args = ['/api/hello', '--deployment', deploymentId];
    if (source === 'flag') args.push('--protection-bypass', 'caller-secret');
    else vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'caller-secret');
    client.setArgv('curl', ...args);

    expect(await curl(client)).toBe(0);
    expect(attempts).toEqual([undefined, ownerId]);
    expect(vi.mocked(spawn).mock.calls[0][1]).toContain(
      'x-vercel-protection-bypass: caller-secret'
    );
  });

  it('does not require scope lookup for a URL with a supplied bypass', async () => {
    client.config.currentTeam = 'team_deleted';
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv(
      'curl',
      '/api/hello',
      '--deployment',
      `https://${hostname}`,
      '--protection-bypass',
      'caller-secret'
    );

    expect(await curl(client)).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not search outside an explicitly requested scope', async () => {
    useTeams('team_wrong');
    createTeam(ownerId);
    client.config.currentTeam = 'team_wrong';
    const attempts = protectedDeployment();
    client.setArgv(
      'curl',
      '/api/hello',
      '--deployment',
      deploymentId,
      '--scope',
      'wrong'
    );

    expect(await curl(client)).toBe(1);
    expect(attempts).toEqual(['team_wrong']);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('fails for an inaccessible deployment ID without sending any request to the deployment', async () => {
    useTeams('team_other');
    const attempts = protectedDeployment();
    client.setArgv('curl', '/api/hello', '--deployment', deploymentId);

    expect(await curl(client)).toBe(1);
    expect(attempts).toEqual([undefined, 'team_other']);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('does not enumerate teams after rate limiting', async () => {
    const teams = vi.fn((_req, res) => res.json({ teams: [] }));
    client.scenario.get('/v1/teams', teams);
    client.scenario.get('/v13/deployments/:selector', (_req, res) => {
      res.status(429).json({ error: { code: 'rate_limited' } });
    });
    client.setArgv('curl', `https://${hostname}`);

    await expect(resolveDeployment(client, hostname)).rejects.toMatchObject({
      status: 429,
    });
    expect(teams).not.toHaveBeenCalled();
  });
});
