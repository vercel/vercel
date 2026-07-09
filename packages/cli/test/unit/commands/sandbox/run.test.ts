import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APIError } from '@vercel/sandbox';
import { client } from '../../../mocks/client';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';
import { runSubcommand } from '../../../../src/commands/sandbox/run/command';
import { parseArguments } from '../../../../src/util/get-args';
import { getFlagsSpecification } from '../../../../src/util/get-flags-specification';

const { sandboxGet, execInSandbox, runCreate } = vi.hoisted(() => ({
  sandboxGet: vi.fn(),
  execInSandbox: vi.fn(),
  runCreate: vi.fn(),
}));

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');
vi.mock('../../../../src/util/sandbox/client', () => ({
  sandboxClient: { get: sandboxGet },
}));
vi.mock('../../../../src/util/sandbox/exec-core', () => ({
  execInSandbox,
}));
vi.mock('../../../../src/commands/sandbox/create', async importActual => {
  const actual =
    await importActual<
      typeof import('../../../../src/commands/sandbox/create')
    >();
  return { ...actual, runCreate };
});

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScopeModule.default);

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

function mockTeamScope() {
  mockedGetScope.mockResolvedValue({
    contextName: 'my-team',
    team: { id: 'team_dummy', slug: 'my-team' } as any,
    user: { id: 'user_dummy' } as any,
  } as any);
}

function makeFakeSandbox(overrides: Record<string, unknown> = {}) {
  return {
    name: 'my-sandbox',
    delete: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

function makeNotFoundError() {
  const response = new Response(null, { status: 404 });
  const apiError = new APIError(response);
  return new Error('Sandbox not found', { cause: apiError });
}

describe('sandbox run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    execInSandbox.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints help and returns 2 for --help', async () => {
    const { default: run } = await import(
      '../../../../src/commands/sandbox/run'
    );
    const exitCode = await run(client, ['--help']);

    expect(exitCode).toBe(2);
    expect(runCreate).not.toHaveBeenCalled();
    expect(sandboxGet).not.toHaveBeenCalled();
  });

  it('rejects --rm combined with --stop', async () => {
    const { default: run } = await import(
      '../../../../src/commands/sandbox/run'
    );
    const exitCode = await run(client, ['--rm', '--stop', '--', 'echo', 'hi']);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('mutually exclusive');
    expect(runCreate).not.toHaveBeenCalled();
    expect(sandboxGet).not.toHaveBeenCalled();
  });

  it('errors when the command positional is missing', async () => {
    const { default: run } = await import(
      '../../../../src/commands/sandbox/run'
    );
    const exitCode = await run(client, ['--name', 'my-sandbox']);

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('command');
    expect(sandboxGet).not.toHaveBeenCalled();
    expect(runCreate).not.toHaveBeenCalled();
  });

  it('execs without creating when a named sandbox already exists', async () => {
    const fakeSandbox = makeFakeSandbox();
    sandboxGet.mockResolvedValue(fakeSandbox);
    const { default: run } = await import(
      '../../../../src/commands/sandbox/run'
    );

    const exitCode = await run(client, [
      '--name',
      'my-sandbox',
      '--',
      'echo',
      'hi',
    ]);

    expect(exitCode).toBe(0);
    expect(sandboxGet).toHaveBeenCalledWith({
      name: 'my-sandbox',
      token: expect.any(String),
      teamId: 'team_dummy',
      projectId: 'prj_sandbox',
      resume: true,
      __includeSystemRoutes: true,
    });
    expect(runCreate).not.toHaveBeenCalled();
    expect(execInSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        sandbox: fakeSandbox,
        command: 'echo',
        args: ['hi'],
        timeout: undefined,
      })
    );
  });

  it('creates the sandbox when the named lookup 404s', async () => {
    sandboxGet.mockRejectedValue(makeNotFoundError());
    const fakeSandbox = makeFakeSandbox();
    runCreate.mockResolvedValue(fakeSandbox);
    const { default: run } = await import(
      '../../../../src/commands/sandbox/run'
    );

    const exitCode = await run(client, [
      '--name',
      'my-sandbox',
      '--',
      'echo',
      'hi',
    ]);

    expect(exitCode).toBe(0);
    expect(runCreate).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ name: 'my-sandbox' })
    );
    expect(execInSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ sandbox: fakeSandbox })
    );
  });

  it('propagates a non-404 error from the named lookup without creating', async () => {
    sandboxGet.mockRejectedValue(new Error('boom'));
    const { default: run } = await import(
      '../../../../src/commands/sandbox/run'
    );

    const exitCode = await run(client, [
      '--name',
      'my-sandbox',
      '--',
      'echo',
      'hi',
    ]);

    expect(exitCode).toBe(1);
    expect(runCreate).not.toHaveBeenCalled();
    expect(execInSandbox).not.toHaveBeenCalled();
  });

  it('always creates when no --name is given', async () => {
    const fakeSandbox = makeFakeSandbox();
    runCreate.mockResolvedValue(fakeSandbox);
    const { default: run } = await import(
      '../../../../src/commands/sandbox/run'
    );

    const exitCode = await run(client, ['--', 'echo', 'hi']);

    expect(exitCode).toBe(0);
    expect(sandboxGet).not.toHaveBeenCalled();
    expect(runCreate).toHaveBeenCalledTimes(1);
  });

  it('forces nonPersistent when --rm is set and deletes the sandbox after a successful run', async () => {
    const fakeSandbox = makeFakeSandbox();
    runCreate.mockResolvedValue(fakeSandbox);
    const { default: run } = await import(
      '../../../../src/commands/sandbox/run'
    );

    const exitCode = await run(client, ['--rm', '--', 'echo', 'hi']);

    expect(exitCode).toBe(0);
    expect(runCreate).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ nonPersistent: true })
    );
    expect(fakeSandbox.delete).toHaveBeenCalledTimes(1);
  });

  it('deletes the sandbox in finally even when the exec throws, with --rm', async () => {
    const fakeSandbox = makeFakeSandbox();
    runCreate.mockResolvedValue(fakeSandbox);
    execInSandbox.mockRejectedValue(new Error('exec failed'));
    const { default: run } = await import(
      '../../../../src/commands/sandbox/run'
    );

    const exitCode = await run(client, ['--rm', '--', 'echo', 'hi']);

    expect(exitCode).toBe(1);
    expect(fakeSandbox.delete).toHaveBeenCalledTimes(1);
  });

  it('stops the sandbox after a successful run with --stop', async () => {
    const fakeSandbox = makeFakeSandbox();
    runCreate.mockResolvedValue(fakeSandbox);
    const { default: run } = await import(
      '../../../../src/commands/sandbox/run'
    );

    const exitCode = await run(client, ['--stop', '--', 'echo', 'hi']);

    expect(exitCode).toBe(0);
    expect(fakeSandbox.stop).toHaveBeenCalledTimes(1);
    expect(fakeSandbox.delete).not.toHaveBeenCalled();
  });

  it('does not clean up when neither --rm nor --stop is set', async () => {
    const fakeSandbox = makeFakeSandbox();
    runCreate.mockResolvedValue(fakeSandbox);
    const { default: run } = await import(
      '../../../../src/commands/sandbox/run'
    );

    const exitCode = await run(client, ['--', 'echo', 'hi']);

    expect(exitCode).toBe(0);
    expect(fakeSandbox.delete).not.toHaveBeenCalled();
    expect(fakeSandbox.stop).not.toHaveBeenCalled();
  });

  it('does not let -t shadow the global --token shorthand for --tag', () => {
    const hasShortTag = runSubcommand.options.some(
      opt => 'name' in opt && opt.name === 'tag' && opt.shorthand === 't'
    );
    expect(hasShortTag).toBe(false);

    const { flags } = parseArguments(
      ['-t', 'my-token', '--', 'echo', 'hi'],
      getFlagsSpecification(runSubcommand.options)
    );

    expect(flags['--token']).toBe('my-token');
    expect(flags['--tag']).toBeUndefined();
  });

  it('does not let -t shadow the global --token shorthand for --tty', () => {
    const hasShortTty = runSubcommand.options.some(
      opt => 'name' in opt && opt.name === 'tty' && opt.shorthand === 't'
    );
    expect(hasShortTty).toBe(false);

    const { flags } = parseArguments(
      ['-t', 'my-token', '--', 'echo', 'hi'],
      getFlagsSpecification(runSubcommand.options)
    );

    expect(flags['--token']).toBe('my-token');
    expect(flags['--tty']).toBeUndefined();
  });
});
