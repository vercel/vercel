import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import sandbox from '../../../../src/commands/sandbox';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';
import * as getProjectModule from '../../../../src/util/projects/get-project-by-id-or-name';

const { sandboxGet, execInSandbox } = vi.hoisted(() => ({
  sandboxGet: vi.fn(),
  execInSandbox: vi.fn(),
}));

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');
vi.mock('../../../../src/util/projects/get-project-by-id-or-name');
vi.mock('../../../../src/util/sandbox/client', () => ({
  sandboxClient: { get: sandboxGet },
}));
vi.mock('../../../../src/util/sandbox/exec-core', () => ({
  execInSandbox,
}));

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScopeModule.default);
const mockedGetProject = vi.mocked(getProjectModule.default);

function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_sandbox',
      name: 'sandbox-project',
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: {
      id: 'team_dummy',
      slug: 'my-team',
      type: 'team',
    },
  } as any);
}

function mockNotLinked() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'not_linked',
    org: null,
    project: null,
  } as any);
}

function mockTeamScope() {
  mockedGetScope.mockResolvedValue({
    contextName: 'my-team',
    team: { id: 'team_dummy', slug: 'my-team' } as any,
    user: { id: 'user_dummy' } as any,
  } as any);
}

const fakeSandbox = { name: 'my-sandbox' } as any;

describe('sandbox exec', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    sandboxGet.mockResolvedValue(fakeSandbox);
    execInSandbox.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints help and returns 2 for --help', async () => {
    client.setArgv('sandbox', 'exec', '--help');
    const exitCode = await sandbox(client);
    expect(exitCode).toBe(2);
    expect(sandboxGet).not.toHaveBeenCalled();
  });

  it('resolves the linked project and resumes the named sandbox', async () => {
    client.setArgv('sandbox', 'exec', 'my-sandbox', 'echo', 'hi');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxGet).toHaveBeenCalledWith({
      name: 'my-sandbox',
      token: expect.any(String),
      teamId: 'team_dummy',
      projectId: 'prj_sandbox',
      resume: true,
      __includeSystemRoutes: true,
    });
  });

  it('delegates to execInSandbox with parsed flags for a non-interactive command', async () => {
    client.setArgv(
      'sandbox',
      'exec',
      'my-sandbox',
      '--workdir',
      '/app',
      '--sudo',
      '--timeout',
      '30s',
      '--',
      'npm',
      'install'
    );
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(execInSandbox).toHaveBeenCalledWith({
      sandbox: fakeSandbox,
      command: 'npm',
      args: ['install'],
      cwd: '/app',
      env: {},
      sudo: true,
      interactive: false,
      skipExtendingTimeout: false,
      timeout: '30s',
    });
  });

  it('parses repeated --env flags into a key/value map', async () => {
    client.setArgv(
      'sandbox',
      'exec',
      'my-sandbox',
      '--env',
      'A=1',
      '-e',
      'B=2',
      '--',
      'node',
      'x.js'
    );
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(execInSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ env: { A: '1', B: '2' } })
    );
  });

  it('passes --interactive through without re-validating the TTY itself', async () => {
    client.setArgv(
      'sandbox',
      'exec',
      'my-sandbox',
      '--interactive',
      '--',
      'bash'
    );
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(execInSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ interactive: true, command: 'bash', args: [] })
    );
  });

  it('surfaces the execInSandbox TTY error unchanged when it rejects', async () => {
    execInSandbox.mockRejectedValue(
      new Error('The --interactive flag requires a terminal (TTY).')
    );
    client.setArgv(
      'sandbox',
      'exec',
      'my-sandbox',
      '--interactive',
      '--',
      'bash'
    );
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '--interactive flag requires a terminal (TTY)'
    );
  });

  it('resolves --project via the current team scope', async () => {
    mockedGetProject.mockResolvedValue({ id: 'prj_other' } as any);
    client.setArgv(
      'sandbox',
      'exec',
      'my-sandbox',
      '--project',
      'other-app',
      '--',
      'echo',
      'hi'
    );
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(mockedGetProject).toHaveBeenCalledWith(
      client,
      'other-app',
      'team_dummy'
    );
    expect(sandboxGet).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'prj_other' })
    );
  });

  it('errors when there is no linked project and no --project flag', async () => {
    mockNotLinked();
    client.setArgv('sandbox', 'exec', 'my-sandbox', '--', 'echo', 'hi');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(1);
    expect(sandboxGet).not.toHaveBeenCalled();
  });

  it('errors when the command positional is missing', async () => {
    client.setArgv('sandbox', 'exec', 'my-sandbox');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('command');
    expect(sandboxGet).not.toHaveBeenCalled();
  });

  it('rejects a malformed --timeout before calling execInSandbox', async () => {
    client.setArgv(
      'sandbox',
      'exec',
      'my-sandbox',
      '--timeout',
      'nonsense',
      '--',
      'echo',
      'hi'
    );
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Malformed duration');
    expect(execInSandbox).not.toHaveBeenCalled();
  });

  it('tracks subcommand invocation', async () => {
    client.setArgv('sandbox', 'exec', 'my-sandbox', '--', 'echo', 'hi');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:exec',
        value: 'exec',
      },
    ]);
  });
});
