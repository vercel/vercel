import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import sandbox from '../../../../src/commands/sandbox';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';
import * as getProjectModule from '../../../../src/util/projects/get-project-by-id-or-name';
import { createSubcommand } from '../../../../src/commands/sandbox/create/command';
import { parseArguments } from '../../../../src/util/get-args';
import { getFlagsSpecification } from '../../../../src/util/get-flags-specification';

const { sandboxCreate, connectToSandbox, printSandboxSummary } = vi.hoisted(
  () => ({
    sandboxCreate: vi.fn(),
    connectToSandbox: vi.fn(),
    printSandboxSummary: vi.fn(),
  })
);

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');
vi.mock('../../../../src/util/projects/get-project-by-id-or-name');
vi.mock('../../../../src/util/sandbox/client', () => ({
  sandboxClient: { create: sandboxCreate },
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
  name: 'my-sandbox',
  interactivePort: 39375,
  routes: [],
} as any;

describe('sandbox create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    sandboxCreate.mockResolvedValue(fakeSandbox);
    connectToSandbox.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints help and returns 2 for --help', async () => {
    client.setArgv('sandbox', 'create', '--help');
    const exitCode = await sandbox(client);
    expect(exitCode).toBe(2);
    expect(sandboxCreate).not.toHaveBeenCalled();
  });

  it('defaults to the node24 runtime when neither --image nor --runtime is given', async () => {
    client.setArgv('sandbox', 'create');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({ runtime: 'node24' })
    );
    expect(sandboxCreate.mock.calls[0][0]).not.toHaveProperty('image');
  });

  it('throws when both --image and --runtime are given', async () => {
    client.setArgv(
      'sandbox',
      'create',
      '--image',
      'my-repo:v1',
      '--runtime',
      'node22'
    );
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      '--image and --runtime cannot be used together.'
    );
    expect(sandboxCreate).not.toHaveBeenCalled();
  });

  it('creates from a snapshot source when --snapshot is given', async () => {
    client.setArgv('sandbox', 'create', '--snapshot', 'snap_abc123');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { type: 'snapshot', snapshotId: 'snap_abc123' },
      })
    );
    const call = sandboxCreate.mock.calls[0][0];
    expect(call).not.toHaveProperty('runtime');
    expect(call).not.toHaveProperty('image');
  });

  it('connects to the sandbox after creating it when --connect is given', async () => {
    client.setArgv('sandbox', 'create', '--connect');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(connectToSandbox).toHaveBeenCalledWith(fakeSandbox);
  });

  it('does not connect when --connect is omitted', async () => {
    client.setArgv('sandbox', 'create');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(connectToSandbox).not.toHaveBeenCalled();
  });

  it('suppresses the summary when --silent is given, but still prints the name to stdout', async () => {
    client.setArgv('sandbox', 'create', '--silent');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(printSandboxSummary).not.toHaveBeenCalled();
  });

  it('prints the summary when --silent is omitted', async () => {
    client.setArgv('sandbox', 'create');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(printSandboxSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        sandbox: fakeSandbox,
        contextName: 'my-team',
        action: 'created',
      })
    );
  });

  it('parses --tag flags into a key/value map', async () => {
    client.setArgv(
      'sandbox',
      'create',
      '--tag',
      'env=staging',
      '--tag',
      'team=infra'
    );
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({ tags: { env: 'staging', team: 'infra' } })
    );
  });

  it('defaults the network policy to allow-all when no network flags are given', async () => {
    client.setArgv('sandbox', 'create');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({ networkPolicy: 'allow-all' })
    );
  });

  it('passes through an explicit --network-policy value', async () => {
    client.setArgv('sandbox', 'create', '--network-policy', 'deny-all');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(sandboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({ networkPolicy: 'deny-all' })
    );
  });

  it('does not let -t shadow the global --token shorthand', () => {
    const hasShortTag = createSubcommand.options.some(
      opt => 'name' in opt && opt.name === 'tag' && opt.shorthand === 't'
    );
    expect(hasShortTag).toBe(false);

    const { flags } = parseArguments(
      ['-t', 'my-token'],
      getFlagsSpecification(createSubcommand.options)
    );

    expect(flags['--token']).toBe('my-token');
    expect(flags['--tag']).toBeUndefined();
  });

  it('resolves --project via the current team scope', async () => {
    mockedGetProject.mockResolvedValue({ id: 'prj_other' } as any);
    client.setArgv('sandbox', 'create', '--project', 'other-app');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(mockedGetProject).toHaveBeenCalledWith(
      client,
      'other-app',
      'team_dummy'
    );
    expect(sandboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'prj_other' })
    );
  });

  it('errors when there is no linked project and no --project flag', async () => {
    mockNotLinked();
    client.setArgv('sandbox', 'create');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(1);
    expect(sandboxCreate).not.toHaveBeenCalled();
  });

  it('tracks subcommand invocation', async () => {
    client.setArgv('sandbox', 'create');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:create',
        value: 'create',
      },
    ]);
  });
});
