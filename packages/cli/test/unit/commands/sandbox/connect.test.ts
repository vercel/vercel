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

describe.each([
  ['connect', 'connect'],
  ['ssh', 'ssh'],
  ['shell', 'shell'],
])('sandbox %s', (invokedAs, _label) => {
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
    client.setArgv('sandbox', invokedAs, '--help');
    const exitCode = await sandbox(client);
    expect(exitCode).toBe(2);
    expect(sandboxGet).not.toHaveBeenCalled();
  });

  it('resolves the linked project and resumes the named sandbox', async () => {
    client.setArgv('sandbox', invokedAs, 'my-sandbox');
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

  it('forces an interactive sh shell with the parsed flags', async () => {
    client.setArgv(
      'sandbox',
      invokedAs,
      'my-sandbox',
      '--sudo',
      '--workdir',
      '/app',
      '--env',
      'A=1',
      '-e',
      'B=2'
    );
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(execInSandbox).toHaveBeenCalledWith({
      sandbox: fakeSandbox,
      command: 'sh',
      args: [],
      interactive: true,
      sudo: true,
      skipExtendingTimeout: false,
      cwd: '/app',
      env: { A: '1', B: '2' },
      timeout: undefined,
    });
  });

  it('defaults sudo/skipExtendingTimeout/cwd/env when no flags are passed', async () => {
    client.setArgv('sandbox', invokedAs, 'my-sandbox');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(execInSandbox).toHaveBeenCalledWith({
      sandbox: fakeSandbox,
      command: 'sh',
      args: [],
      interactive: true,
      sudo: false,
      skipExtendingTimeout: false,
      cwd: undefined,
      env: {},
      timeout: undefined,
    });
  });

  it('passes --no-extend-timeout through', async () => {
    client.setArgv('sandbox', invokedAs, 'my-sandbox', '--no-extend-timeout');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(execInSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ skipExtendingTimeout: true })
    );
  });

  it('surfaces the execInSandbox TTY error unchanged when it rejects', async () => {
    execInSandbox.mockRejectedValue(
      new Error('The --interactive flag requires a terminal (TTY).')
    );
    client.setArgv('sandbox', invokedAs, 'my-sandbox');
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
      invokedAs,
      'my-sandbox',
      '--project',
      'other-app'
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
    client.setArgv('sandbox', invokedAs, 'my-sandbox');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(1);
    expect(sandboxGet).not.toHaveBeenCalled();
  });

  it('errors when the name positional is missing', async () => {
    client.setArgv('sandbox', invokedAs);
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(1);
    expect(sandboxGet).not.toHaveBeenCalled();
  });

  it('tracks subcommand invocation with the original alias', async () => {
    client.setArgv('sandbox', invokedAs, 'my-sandbox');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:connect',
        value: invokedAs,
      },
    ]);
  });
});

describe('sandbox connect --timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    sandboxGet.mockResolvedValue(fakeSandbox);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards --timeout and surfaces the execInSandbox mutual-exclusion error', async () => {
    execInSandbox.mockRejectedValue(
      new Error('--timeout cannot be combined with --interactive.')
    );
    client.setArgv('sandbox', 'connect', 'my-sandbox', '--timeout', '30s');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(1);
    expect(execInSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: '30s' })
    );
    expect(client.stderr.getFullOutput()).toContain(
      '--timeout cannot be combined with --interactive'
    );
  });
});
