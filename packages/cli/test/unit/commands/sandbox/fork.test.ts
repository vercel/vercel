import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import sandbox from '../../../../src/commands/sandbox';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';
import * as getProjectModule from '../../../../src/util/projects/get-project-by-id-or-name';
import { forkSubcommand } from '../../../../src/commands/sandbox/fork/command';
import { parseArguments } from '../../../../src/util/get-args';
import { getFlagsSpecification } from '../../../../src/util/get-flags-specification';

const { sandboxFork, connectToSandbox, printSandboxSummary } = vi.hoisted(
  () => ({
    sandboxFork: vi.fn(),
    connectToSandbox: vi.fn(),
    printSandboxSummary: vi.fn(),
  })
);

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');
vi.mock('../../../../src/util/projects/get-project-by-id-or-name');
vi.mock('../../../../src/util/sandbox/client', () => ({
  sandboxClient: { fork: sandboxFork },
}));
vi.mock('../../../../src/util/sandbox/exec-core', () => ({
  connectToSandbox,
  assertInteractivePort: vi.fn(),
}));
vi.mock('../../../../src/util/sandbox/print-sandbox-summary', () => ({
  printSandboxSummary,
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

const fakeSandbox = {
  name: 'my-forked-sandbox',
  interactivePort: 39375,
  routes: [],
} as any;

describe('sandbox fork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    sandboxFork.mockResolvedValue(fakeSandbox);
    connectToSandbox.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints help and returns 2 for --help', async () => {
    client.setArgv('sandbox', 'fork', '--help');
    const exitCode = await sandbox(client);
    expect(exitCode).toBe(2);
    expect(sandboxFork).not.toHaveBeenCalled();
  });

  it('errors when the source positional is missing', async () => {
    client.setArgv('sandbox', 'fork');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(1);
    expect(sandboxFork).not.toHaveBeenCalled();
  });

  it('forks with only the required fields when no optional flags are given', async () => {
    client.setArgv('sandbox', 'fork', 'my-source');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxFork).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSandbox: 'my-source',
        teamId: 'team_dummy',
        projectId: 'prj_sandbox',
        token: expect.any(String),
        __interactive: true,
      })
    );

    const call = sandboxFork.mock.calls[0][0];
    expect(call).not.toHaveProperty('name');
    expect(call).not.toHaveProperty('ports');
    expect(call).not.toHaveProperty('timeout');
    expect(call).not.toHaveProperty('resources');
    expect(call).not.toHaveProperty('networkPolicy');
    expect(call).not.toHaveProperty('env');
    expect(call).not.toHaveProperty('tags');
    expect(call).not.toHaveProperty('persistent');
    expect(call).not.toHaveProperty('snapshotExpiration');
    expect(call).not.toHaveProperty('keepLastSnapshots');
  });

  it('passes --name through as an override', async () => {
    client.setArgv('sandbox', 'fork', 'my-source', '--name', 'my-fork');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxFork).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'my-fork' })
    );
  });

  it('passes --vcpus through as a resources override', async () => {
    client.setArgv('sandbox', 'fork', 'my-source', '--vcpus', '4');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxFork).toHaveBeenCalledWith(
      expect.objectContaining({ resources: { vcpus: 4 } })
    );
  });

  it('passes --timeout through as an override with no default applied', async () => {
    client.setArgv('sandbox', 'fork', 'my-source', '--timeout', '30m');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxFork).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 30 * 60 * 1000 })
    );
  });

  it('passes --publish-port through as a ports override', async () => {
    client.setArgv(
      'sandbox',
      'fork',
      'my-source',
      '--publish-port',
      '3000',
      '--publish-port',
      '8080'
    );
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxFork).toHaveBeenCalledWith(
      expect.objectContaining({ ports: [3000, 8080] })
    );
  });

  it('does not set a network policy when no network flags are given (inherit from source)', async () => {
    client.setArgv('sandbox', 'fork', 'my-source');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    const call = sandboxFork.mock.calls[0][0];
    expect(call).not.toHaveProperty('networkPolicy');
  });

  it('passes through an explicit --network-policy value', async () => {
    client.setArgv(
      'sandbox',
      'fork',
      'my-source',
      '--network-policy',
      'deny-all'
    );
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxFork).toHaveBeenCalledWith(
      expect.objectContaining({ networkPolicy: 'deny-all' })
    );
  });

  it('builds a custom network policy from --allowed-domain', async () => {
    client.setArgv(
      'sandbox',
      'fork',
      'my-source',
      '--allowed-domain',
      '*.vercel.com'
    );
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxFork).toHaveBeenCalledWith(
      expect.objectContaining({
        networkPolicy: { allow: ['*.vercel.com'] },
      })
    );
  });

  it('sets env only when --env is given', async () => {
    client.setArgv(
      'sandbox',
      'fork',
      'my-source',
      '--env',
      'FOO=bar',
      '--env',
      'BAZ=qux'
    );
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxFork).toHaveBeenCalledWith(
      expect.objectContaining({ env: { FOO: 'bar', BAZ: 'qux' } })
    );
  });

  it('sets tags only when --tag is given, replacing rather than merging', async () => {
    client.setArgv('sandbox', 'fork', 'my-source', '--tag', 'env=staging');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxFork).toHaveBeenCalledWith(
      expect.objectContaining({ tags: { env: 'staging' } })
    );
  });

  it('passes persistent: false only when --non-persistent is given', async () => {
    client.setArgv('sandbox', 'fork', 'my-source', '--non-persistent');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxFork).toHaveBeenCalledWith(
      expect.objectContaining({ persistent: false })
    );
  });

  it('does not pass persistent when --non-persistent is omitted', async () => {
    client.setArgv('sandbox', 'fork', 'my-source');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    const call = sandboxFork.mock.calls[0][0];
    expect(call).not.toHaveProperty('persistent');
  });

  it('passes snapshotExpiration and keepLastSnapshots overrides through', async () => {
    client.setArgv(
      'sandbox',
      'fork',
      'my-source',
      '--snapshot-expiration',
      '7d',
      '--keep-last-snapshots',
      '3'
    );
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxFork).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshotExpiration: 7 * 24 * 60 * 60 * 1000,
        keepLastSnapshots: {
          count: 3,
          expiration: undefined,
          deleteEvicted: undefined,
        },
      })
    );
  });

  it('connects to the sandbox after forking it when --connect is given', async () => {
    client.setArgv('sandbox', 'fork', 'my-source', '--connect');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(connectToSandbox).toHaveBeenCalledWith(fakeSandbox);
  });

  it('does not connect when --connect is omitted', async () => {
    client.setArgv('sandbox', 'fork', 'my-source');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(connectToSandbox).not.toHaveBeenCalled();
  });

  it('suppresses the summary and getScope when --silent is given', async () => {
    client.setArgv('sandbox', 'fork', 'my-source', '--silent');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(printSandboxSummary).not.toHaveBeenCalled();
    expect(mockedGetScope).not.toHaveBeenCalled();
  });

  it('prints the summary with a "forked from" action when --silent is omitted', async () => {
    client.setArgv('sandbox', 'fork', 'my-source');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(printSandboxSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        sandbox: fakeSandbox,
        contextName: 'my-team',
        action: 'forked from my-source',
      })
    );
    expect(mockedGetScope).toHaveBeenCalled();
  });

  it('does not let -t shadow the global --token shorthand', () => {
    const hasShortTag = forkSubcommand.options.some(
      opt => 'name' in opt && opt.name === 'tag' && opt.shorthand === 't'
    );
    expect(hasShortTag).toBe(false);

    const { flags } = parseArguments(
      ['-t', 'my-token'],
      getFlagsSpecification(forkSubcommand.options)
    );

    expect(flags['--token']).toBe('my-token');
    expect(flags['--tag']).toBeUndefined();
  });

  it('resolves --project via the current team scope', async () => {
    mockedGetProject.mockResolvedValue({ id: 'prj_other' } as any);
    client.setArgv('sandbox', 'fork', 'my-source', '--project', 'other-app');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(mockedGetProject).toHaveBeenCalledWith(
      client,
      'other-app',
      'team_dummy'
    );
    expect(sandboxFork).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'prj_other' })
    );
  });

  it('errors when there is no linked project and no --project flag', async () => {
    mockNotLinked();
    client.setArgv('sandbox', 'fork', 'my-source');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(1);
    expect(sandboxFork).not.toHaveBeenCalled();
  });

  it('tracks subcommand invocation', async () => {
    client.setArgv('sandbox', 'fork', 'my-source');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:fork',
        value: 'fork',
      },
    ]);
  });
});
