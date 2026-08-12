import { describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import { join } from 'path';
import { client } from '../../../mocks/client';
import deploy from '../../../../src/commands/deploy';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

const buildMock = vi.hoisted(() => vi.fn());
vi.mock('../../../../src/commands/build', () => ({ default: buildMock }));

const loginMock = vi.hoisted(() => vi.fn());
vi.mock('../../../../src/commands/login', () => ({ default: loginMock }));

const ciInfoMock = vi.hoisted(() => ({ isCI: false }));
vi.mock('ci-info', () => ({ default: ciInfoMock }));

const ANONYMOUS_FILE = join('.vercel', 'anonymous.json');

function mockBootstrap(state: { token: string; expiresAt: number }) {
  let calls = 0;
  client.scenario.post('/v1/anonymous/projects', (req, res) => {
    calls++;
    expect(req.query.surface).toBe('cli');
    res.status(200).json({
      projectId: 'prj_anon',
      claimUrl: 'https://vercel.com/claim-deployment?code=claim_dummy',
      ...state,
    });
  });
  return () => calls;
}

function mockDeploymentEndpoints() {
  const requests: {
    authorization?: string;
    teamId?: string;
    skipAutoDetectionConfirmation?: string;
  }[] = [];
  client.scenario.post('/v13/deployments', (req, res) => {
    requests.push({
      authorization: req.headers.authorization,
      teamId: req.query.teamId as string,
      skipAutoDetectionConfirmation: req.query
        .skipAutoDetectionConfirmation as string,
    });
    res.json({
      id: 'dpl_anon',
      url: 'anon-app-abc.vercel.app',
      readyState: 'QUEUED',
      creator: { uid: 'anon' },
    });
  });
  client.scenario.get('/v13/deployments/dpl_anon', (req, res) => {
    res.json({
      id: 'dpl_anon',
      url: 'anon-app-abc.vercel.app',
      readyState: 'READY',
      aliasAssigned: true,
      alias: ['anon-app.vercel.app'],
      target: 'production',
      creator: { uid: 'anon' },
    });
  });
  return requests;
}

describe('deploy [anonymous]', () => {
  it.each([
    { command: 'vc', argv: [] },
    { command: 'vc deploy', argv: ['deploy'] },
  ])('prompts before temporary deployment with $command', async ({ argv }) => {
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    const getBootstrapCalls = mockBootstrap({
      token: 'vcn_test',
      expiresAt: Date.now() + 3600_000,
    });
    mockDeploymentEndpoints();
    const confirmMock = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(true);

    client.setArgv(argv);
    let exitCode: number;
    try {
      exitCode = await deploy(client);
      expect(confirmMock).toHaveBeenCalledWith(
        'Deploy temporarily without logging in?',
        true
      );
    } finally {
      confirmMock.mockRestore();
    }

    expect(exitCode).toEqual(0);
    expect(getBootstrapCalls()).toEqual(1);
  });

  it('requires --yes instead of prompting in non-interactive mode', async () => {
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    const getBootstrapCalls = mockBootstrap({
      token: 'vcn_test',
      expiresAt: Date.now() + 3600_000,
    });
    client.nonInteractive = true;
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);

    client.setArgv('deploy', '--non-interactive');
    let exitCode: number;
    try {
      exitCode = await deploy(client);
    } finally {
      exitSpy.mockRestore();
      client.nonInteractive = false;
    }

    expect(exitCode).toEqual(1);
    expect(getBootstrapCalls()).toEqual(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'action_required',
      reason: 'confirmation_required',
      next: [
        {
          command: 'vercel deploy --non-interactive --yes',
        },
      ],
    });
  });

  it('does not report temporary deployments as unavailable when declined', async () => {
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    const getBootstrapCalls = mockBootstrap({
      token: 'vcn_test',
      expiresAt: Date.now() + 3600_000,
    });
    const confirmMock = vi
      .spyOn(client.input, 'confirm')
      .mockResolvedValue(false);

    client.setArgv('deploy');
    try {
      expect(await deploy(client)).toEqual(1);
    } finally {
      confirmMock.mockRestore();
    }

    expect(getBootstrapCalls()).toEqual(0);
    expect(client.stderr.getFullOutput()).not.toContain(
      "Temporary deployments aren't available."
    );
  });

  it.each([
    { command: 'vc deploy --yes', argv: ['deploy', '--yes'] },
    {
      command: 'vc deploy --prod --yes',
      argv: ['deploy', '--prod', '--yes'],
    },
  ])('runs $command without prompting', async ({ argv }) => {
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    // A stray VERCEL_TEAM_ID must not ride on the anonymous deploy — the token
    // is the sole authority and the team would be an inaccessible scope.
    const originalTeamId = process.env.VERCEL_TEAM_ID;
    process.env.VERCEL_TEAM_ID = 'team_should_be_stripped';
    const getBootstrapCalls = mockBootstrap({
      token: 'vcn_test',
      expiresAt: Date.now() + 3600_000,
    });
    const requests = mockDeploymentEndpoints();
    const confirmMock = vi.spyOn(client.input, 'confirm');

    client.setArgv(argv);
    let exitCode: number;
    try {
      exitCode = await deploy(client);
      expect(confirmMock).not.toHaveBeenCalled();
    } finally {
      confirmMock.mockRestore();
      if (originalTeamId === undefined) {
        delete process.env.VERCEL_TEAM_ID;
      } else {
        process.env.VERCEL_TEAM_ID = originalTeamId;
      }
    }

    expect(exitCode).toEqual(0);
    expect(getBootstrapCalls()).toEqual(1);
    expect(requests[0].authorization).toEqual('Bearer vcn_test');
    expect(requests[0].teamId).toBeUndefined();
    expect(requests[0].skipAutoDetectionConfirmation).toEqual('1');
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Deploying anonymously');
    expect(stderr).toContain('https://anon-app.vercel.app');
    expect(stderr).not.toContain('anon-app-abc.vercel.app');
    expect(stderr).not.toContain('Inspect');
    expect(stderr).toMatch(/Temporary\s+https:\/\/anon-app\.vercel\.app/);
    expect(stderr).toMatch(
      /This deployment expires in .*\. Claim it to keep it live \(don't share this link\): /
    );
    expect(stderr).toContain(
      'https://vercel.com/claim-deployment?code=claim_dummy'
    );

    const state = await fs.readJSON(join(cwd, ANONYMOUS_FILE));
    expect(state).toEqual({
      projectId: 'prj_anon',
      token: 'vcn_test',
      claimUrl: 'https://vercel.com/claim-deployment?code=claim_dummy',
      expiresAt: expect.any(Number),
    });
    expect(await fs.pathExists(join(cwd, '.vercel/project.json'))).toEqual(
      false
    );
  });

  it('falls back to login for a dry run without an existing anonymous deployment', async () => {
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    const getBootstrapCalls = mockBootstrap({
      token: 'vcn_test',
      expiresAt: Date.now() + 3600_000,
    });

    client.setArgv('deploy', '--dry');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(1);
    expect(getBootstrapCalls()).toEqual(0);
    expect(await fs.pathExists(join(cwd, ANONYMOUS_FILE))).toEqual(false);
    expect(client.stderr.getFullOutput()).toContain(
      'No existing credentials found'
    );
  });

  it('dry runs against an existing anonymous deployment without deploying', async () => {
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    const getBootstrapCalls = mockBootstrap({
      token: 'vcn_fresh',
      expiresAt: Date.now() + 3600_000,
    });
    const requests = mockDeploymentEndpoints();
    await fs.outputJSON(join(cwd, ANONYMOUS_FILE), {
      projectId: 'prj_anon',
      token: 'vcn_sticky',
      claimUrl: 'https://vercel.com/claim-deployment?code=claim_sticky',
      expiresAt: Date.now() + 1800_000,
    });

    client.setArgv('deploy', '--dry');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(0);
    expect(getBootstrapCalls()).toEqual(0);
    expect(requests.length).toEqual(0);
  });

  it('rejects an explicit non-production target when deploying anonymously', async () => {
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    const getBootstrapCalls = mockBootstrap({
      token: 'vcn_test',
      expiresAt: Date.now() + 3600_000,
    });

    client.setArgv('deploy', '--target', 'preview');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(1);
    expect(getBootstrapCalls()).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain(
      'Anonymous deployments always target production'
    );
  });

  it('falls back to login in a linked directory instead of deploying anon', async () => {
    const cwd = setupUnitFixture('commands/deploy/static');
    client.cwd = cwd;
    client.authConfig = {};
    const getBootstrapCalls = mockBootstrap({
      token: 'vcn_test',
      expiresAt: Date.now() + 3600_000,
    });

    client.setArgv('deploy', '--yes');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(1);
    expect(getBootstrapCalls()).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No existing credentials found'
    );
  });

  it('requires credentials in CI instead of deploying temporarily', async () => {
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    client.isAgent = true;
    const getBootstrapCalls = mockBootstrap({
      token: 'vcn_test',
      expiresAt: Date.now() + 3600_000,
    });
    ciInfoMock.isCI = true;

    try {
      client.setArgv('deploy', '--yes');
      const exitCode = await deploy(client);

      expect(exitCode).toEqual(1);
      expect(getBootstrapCalls()).toEqual(0);
      expect(loginMock).not.toHaveBeenCalled();
      expect(client.stderr.getFullOutput()).toContain(
        'No existing credentials found'
      );
      expect(await fs.pathExists(join(cwd, ANONYMOUS_FILE))).toEqual(false);
    } finally {
      ciInfoMock.isCI = false;
    }
  });

  it('starts the login flow when bootstrap is refused and stdout is a TTY', async () => {
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    client.scenario.post('/v1/anonymous/projects', (req, res) => {
      res.status(404).json({ error: { code: 'not_found' } });
    });
    loginMock.mockResolvedValue(1);
    const originalIsTTY = process.stdout.isTTY;
    process.stdout.isTTY = true;

    try {
      client.setArgv('deploy', '--yes');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(1);
      expect(loginMock).toHaveBeenCalledTimes(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain("Temporary deployments aren't available.");
      expect(
        stderr.indexOf("Temporary deployments aren't available.")
      ).toBeLessThan(
        stderr.indexOf('No existing credentials found. Please log in:')
      );
    } finally {
      process.stdout.isTTY = originalIsTTY;
    }
  });

  it('falls back to the login error when bootstrap fails, without retrying', async () => {
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    let bootstrapCalls = 0;
    client.scenario.post('/v1/anonymous/projects', (req, res) => {
      bootstrapCalls++;
      res.status(500).json({ error: { code: 'internal_server_error' } });
    });

    client.setArgv('deploy', '--yes');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(1);
    expect(bootstrapCalls).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'No existing credentials found. Please run `vercel login` or pass "--token"'
    );
    expect(await fs.pathExists(join(cwd, ANONYMOUS_FILE))).toEqual(false);
  });

  it('reuses a valid anonymous state file without bootstrapping again', async () => {
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    const getBootstrapCalls = mockBootstrap({
      token: 'vcn_fresh',
      expiresAt: Date.now() + 3600_000,
    });
    const requests = mockDeploymentEndpoints();
    await fs.outputJSON(join(cwd, ANONYMOUS_FILE), {
      projectId: 'prj_anon',
      token: 'vcn_sticky',
      claimUrl: 'https://vercel.com/claim-deployment?code=claim_sticky',
      expiresAt: Date.now() + 1800_000,
    });

    const confirmMock = vi.spyOn(client.input, 'confirm');
    client.setArgv('deploy');
    let exitCode: number;
    try {
      exitCode = await deploy(client);
    } finally {
      confirmMock.mockRestore();
    }

    expect(exitCode).toEqual(0);
    expect(confirmMock).not.toHaveBeenCalled();
    expect(getBootstrapCalls()).toEqual(0);
    expect(requests[0].authorization).toEqual('Bearer vcn_sticky');
    expect(client.stderr.getFullOutput()).toMatch(
      /This deployment expires in .*\. Claim it to keep it live \(don't share this link\): /
    );
  });

  it('fails with a signup message when the anonymous state file is expired', async () => {
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    const getBootstrapCalls = mockBootstrap({
      token: 'vcn_fresh',
      expiresAt: Date.now() + 3600_000,
    });
    await fs.outputJSON(join(cwd, ANONYMOUS_FILE), {
      projectId: 'prj_anon',
      token: 'vcn_expired',
      claimUrl: 'https://vercel.com/claim-deployment?code=claim_expired',
      expiresAt: Date.now() - 1000,
    });

    client.setArgv('deploy', '--yes');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(1);
    expect(getBootstrapCalls()).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain(
      'Your temporary deployment has expired'
    );
    expect(await fs.pathExists(join(cwd, ANONYMOUS_FILE))).toEqual(true);
  });

  it('preserves claimed project state when login cannot run interactively', async () => {
    loginMock.mockClear();
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    client.nonInteractive = true;
    const getBootstrapCalls = mockBootstrap({
      token: 'vcn_fresh',
      expiresAt: Date.now() + 3600_000,
    });
    await fs.outputJSON(join(cwd, ANONYMOUS_FILE), {
      projectId: 'prj_anon',
      token: 'vcn_claimed',
      claimUrl: 'https://vercel.com/claim-deployment?code=claim_claimed',
      expiresAt: Date.now() + 1800_000,
    });
    client.scenario.post('/v13/deployments', (_req, res) => {
      res.status(410).json({
        error: {
          code: 'anonymous_project_claimed',
          message: 'Project has been claimed',
        },
      });
    });

    client.setArgv('deploy', '--yes');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(1);
    expect(getBootstrapCalls()).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain(
      'This project was claimed successfully. Run `vercel login` to continue deploying it.'
    );
    expect(loginMock).not.toHaveBeenCalled();
    expect(await fs.pathExists(join(cwd, ANONYMOUS_FILE))).toEqual(true);
  });

  it('logs in, links the claimed project, and continues deploying', async () => {
    loginMock.mockClear();
    const teamId = 'team_claimed';
    useTeams(teamId);
    useProject({
      ...defaultProject,
      id: 'prj_anon',
      name: 'claimed-project',
      accountId: teamId,
    });
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    await fs.outputJSON(join(cwd, ANONYMOUS_FILE), {
      projectId: 'prj_anon',
      token: 'vcn_claimed',
      claimUrl: 'https://vercel.com/claim-deployment?code=claim_claimed',
      expiresAt: Date.now() + 1800_000,
    });

    const authorizations: (string | undefined)[] = [];
    let deployCalls = 0;
    client.scenario.post('/v13/deployments', (req, res) => {
      deployCalls++;
      authorizations.push(req.headers.authorization);
      if (deployCalls === 1) {
        res.status(410).json({
          error: {
            code: 'anonymous_project_claimed',
            message: 'Project has been claimed',
          },
        });
        return;
      }
      res.json({
        id: 'dpl_claimed',
        url: 'claimed-project.vercel.app',
        readyState: 'QUEUED',
        creator: { uid: 'user_claimed' },
      });
    });
    client.scenario.get('/v13/deployments/dpl_claimed', (_req, res) => {
      res.json({
        id: 'dpl_claimed',
        url: 'claimed-project.vercel.app',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
        creator: { uid: 'user_claimed' },
      });
    });
    loginMock.mockImplementation(async () => {
      client.authConfig = {
        token: 'token_claimed_user',
        skipWrite: true,
      };
      client.config.currentTeam = teamId;
      return 0;
    });

    client.setArgv('deploy', '--yes');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(0);
    expect(loginMock).toHaveBeenCalledTimes(1);
    expect(authorizations).toEqual([
      'Bearer vcn_claimed',
      'Bearer token_claimed_user',
    ]);
    expect(await fs.readJSON(join(cwd, '.vercel/project.json'))).toEqual({
      projectId: 'prj_anon',
      orgId: teamId,
      projectName: 'claimed-project',
    });
    expect(await fs.pathExists(join(cwd, ANONYMOUS_FILE))).toEqual(false);
    expect(client.stderr.getFullOutput()).toContain(
      'This project was claimed successfully. Log in to continue deploying it.'
    );
  });

  it('clears a leftover anonymous state file when credentials exist', async () => {
    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
    });
    const cwd = setupUnitFixture('commands/deploy/static');
    client.cwd = cwd;
    await fs.outputJSON(join(cwd, ANONYMOUS_FILE), {
      projectId: 'prj_anon',
      token: 'vcn_leftover',
      expiresAt: Date.now() + 3600_000,
    });
    client.scenario.post('/v13/deployments', (req, res) => {
      expect(req.headers.authorization).toEqual('Bearer token_dummy');
      res.json({
        id: 'dpl_authed',
        url: 'static.vercel.app',
        readyState: 'QUEUED',
        creator: { uid: user.id, username: user.username },
      });
    });
    client.scenario.get('/v13/deployments/dpl_authed', (req, res) => {
      res.json({
        id: 'dpl_authed',
        url: 'static.vercel.app',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
        creator: { uid: user.id, username: user.username },
      });
    });

    const confirmMock = vi.spyOn(client.input, 'confirm');
    client.setArgv('deploy');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(0);
    expect(confirmMock).not.toHaveBeenCalled();
    confirmMock.mockRestore();
    expect(await fs.pathExists(join(cwd, ANONYMOUS_FILE))).toEqual(false);
  });

  it('emits expiry and anonymous next commands in non-interactive JSON', async () => {
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    const expiresAt = Date.now() + 3600_000;
    const getBootstrapCalls = mockBootstrap({ token: 'vcn_test', expiresAt });
    mockDeploymentEndpoints();
    await fs.outputJSON(join(cwd, ANONYMOUS_FILE), {
      projectId: 'prj_anon',
      token: 'vcn_sticky',
      claimUrl: 'https://vercel.com/claim-deployment?code=claim_sticky',
      expiresAt,
    });
    (client as { nonInteractive: boolean }).nonInteractive = true;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    client.setArgv('deploy');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(0);
    expect(getBootstrapCalls()).toEqual(0);
    const payload = JSON.parse(
      logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
    );
    expect(payload.status).toEqual('ok');
    expect(payload.deployment.expiresAt).toEqual(expiresAt);
    expect(payload.deployment.url).toEqual('https://anon-app.vercel.app');
    expect(payload.deployment.inspectorUrl).toBeNull();
    expect(payload.deployment.claimUrl).toEqual(
      'https://vercel.com/claim-deployment?code=claim_sticky'
    );
    expect(payload.message).toContain(
      'https://vercel.com/claim-deployment?code=claim_sticky'
    );
    const commands = payload.next.map((n: { command: string }) => n.command);
    expect(commands.some((c: string) => c.includes('login'))).toEqual(true);
    expect(commands.some((c: string) => c.includes('inspect'))).toEqual(false);
    expect(commands.some((c: string) => c.includes('--prod'))).toEqual(false);

    logSpy.mockRestore();
    (client as { nonInteractive: boolean }).nonInteractive = false;
  });

  it('runs an implicit build when prebuilt output is missing', async () => {
    const cwd = setupUnitFixture('commands/deploy/static');
    await fs.remove(join(cwd, '.vercel'));
    client.cwd = cwd;
    client.authConfig = {};
    mockBootstrap({
      token: 'vcn_test',
      expiresAt: Date.now() + 3600_000,
    });
    const requests = mockDeploymentEndpoints();
    buildMock.mockImplementation(async () => {
      client.stdout.write('{"status":"ok","message":"Build completed."}\n');
      const output = join(cwd, '.vercel/output');
      await fs.outputJSON(join(output, 'builds.json'), {
        target: 'production',
        builds: [{ src: '**', use: '@vercel/static' }],
      });
      await fs.outputJSON(join(output, 'config.json'), {
        version: 3,
        routes: [],
      });
      await fs.outputFile(join(output, 'static/index.html'), 'hi');
      return 0;
    });

    client.setArgv('deploy', '--yes');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(0);
    expect(buildMock).toHaveBeenCalledTimes(1);
    // The build's own agent payload must never reach the deploy's stdout: an
    // agent reading it would find two JSON documents.
    expect(client.stdout.getFullOutput()).not.toContain('Build completed.');
    expect(requests.length).toBeGreaterThan(0);
    expect(await fs.readJSON(join(cwd, '.vercel/project.json'))).toEqual({
      settings: {},
    });
  });

  it('fails the deploy when the implicit build fails', async () => {
    const cwd = setupUnitFixture('commands/deploy/static');
    await fs.remove(join(cwd, '.vercel'));
    client.cwd = cwd;
    client.authConfig = {};
    mockBootstrap({
      token: 'vcn_test',
      expiresAt: Date.now() + 3600_000,
    });
    const requests = mockDeploymentEndpoints();
    buildMock.mockResolvedValue(1);

    client.setArgv('deploy', '--yes');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(1);
    expect(requests.length).toEqual(0);
  });
});
