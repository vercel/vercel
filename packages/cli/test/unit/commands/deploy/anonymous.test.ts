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

const ANONYMOUS_FILE = join('.vercel', 'anonymous.json');

function mockBootstrap(state: { token: string; expiresAt: number }) {
  let calls = 0;
  client.scenario.post('/v1/anonymous/projects', (req, res) => {
    calls++;
    res.status(200).json({
      projectId: 'prj_anon',
      claimCode: 'claim_dummy',
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
  it('bootstraps an anonymous project and deploys with its secret', async () => {
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    const getBootstrapCalls = mockBootstrap({
      token: 'vcn_test',
      expiresAt: Date.now() + 3600_000,
    });
    const requests = mockDeploymentEndpoints();

    client.setArgv('deploy');
    const exitCode = await deploy(client);

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
    expect(stderr).toMatch(/You have .* to claim this deployment/);

    const state = await fs.readJSON(join(cwd, ANONYMOUS_FILE));
    expect(state).toEqual({
      projectId: 'prj_anon',
      token: 'vcn_test',
      expiresAt: expect.any(Number),
    });
    expect(await fs.pathExists(join(cwd, '.vercel/project.json'))).toEqual(
      false
    );
  });

  it('refuses a dry run without an existing anonymous deployment', async () => {
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
      'requires an existing anonymous deployment'
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

  it('refuses to deploy anonymously in a linked directory', async () => {
    const cwd = setupUnitFixture('commands/deploy/static');
    client.cwd = cwd;
    client.authConfig = {};
    const getBootstrapCalls = mockBootstrap({
      token: 'vcn_test',
      expiresAt: Date.now() + 3600_000,
    });

    client.setArgv('deploy');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(1);
    expect(getBootstrapCalls()).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain(
      'This directory is linked to an existing Vercel project, but no credentials were found'
    );
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
      client.setArgv('deploy');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(1);
      expect(loginMock).toHaveBeenCalledTimes(1);
      expect(client.stderr.getFullOutput()).toContain(
        'No existing credentials found. Please log in:'
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

    client.setArgv('deploy');
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
      expiresAt: Date.now() + 1800_000,
    });

    client.setArgv('deploy');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(0);
    expect(getBootstrapCalls()).toEqual(0);
    expect(requests[0].authorization).toEqual('Bearer vcn_sticky');
    expect(client.stderr.getFullOutput()).toContain('expires in');
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
      expiresAt: Date.now() - 1000,
    });

    client.setArgv('deploy');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(1);
    expect(getBootstrapCalls()).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain(
      'Your anonymous deployment has expired'
    );
    expect(await fs.pathExists(join(cwd, ANONYMOUS_FILE))).toEqual(true);
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

    client.setArgv('deploy');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(0);
    expect(await fs.pathExists(join(cwd, ANONYMOUS_FILE))).toEqual(false);
  });

  it('emits expiry and anonymous next commands in non-interactive JSON', async () => {
    const cwd = setupUnitFixture('commands/deploy/anonymous');
    client.cwd = cwd;
    client.authConfig = {};
    const expiresAt = Date.now() + 3600_000;
    mockBootstrap({ token: 'vcn_test', expiresAt });
    mockDeploymentEndpoints();
    (client as { nonInteractive: boolean }).nonInteractive = true;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    client.setArgv('deploy');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(0);
    const payload = JSON.parse(
      logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
    );
    expect(payload.status).toEqual('ok');
    expect(payload.deployment.expiresAt).toEqual(expiresAt);
    expect(payload.deployment.url).toEqual('https://anon-app.vercel.app');
    expect(payload.deployment.inspectorUrl).toBeNull();
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

    client.setArgv('deploy');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(0);
    expect(buildMock).toHaveBeenCalledTimes(1);
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

    client.setArgv('deploy');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(1);
    expect(requests.length).toEqual(0);
  });
});
