import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';

afterEach(() => {
  vi.doUnmock('sandbox');
});

describe('sandbox dispatcher', () => {
  it('forwards unknown subcommands to the createApp pass-through', async () => {
    vi.resetModules();
    client.reset();
    const run = vi.fn(async () => {});
    vi.doMock('sandbox', () => ({ createApp: () => ({ run }) }));
    const { default: sandbox } = await import(
      '../../../../src/commands/sandbox'
    );

    client.setArgv('sandbox', 'list', '--connect');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(run).toHaveBeenCalledWith(
      expect.arrayContaining(['list', '--connect'])
    );
  });

  it('re-emits a root --scope flag ahead of the forwarded subcommand args', async () => {
    vi.resetModules();
    client.reset();
    const run = vi.fn(async () => {});
    vi.doMock('sandbox', () => ({ createApp: () => ({ run }) }));
    const { default: sandbox } = await import(
      '../../../../src/commands/sandbox'
    );

    client.setArgv('--scope', 'my-team', 'sandbox', 'list');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(run).toHaveBeenCalledWith(['--scope', 'my-team', 'list']);
  });

  it('re-emits a root --team flag ahead of the forwarded subcommand args', async () => {
    vi.resetModules();
    client.reset();
    const run = vi.fn(async () => {});
    vi.doMock('sandbox', () => ({ createApp: () => ({ run }) }));
    const { default: sandbox } = await import(
      '../../../../src/commands/sandbox'
    );

    client.setArgv('--team', 'my-team', 'sandbox', 'list');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(run).toHaveBeenCalledWith(['--team', 'my-team', 'list']);
  });

  it('forwards a bare top-level --help to the pass-through', async () => {
    vi.resetModules();
    client.reset();
    const run = vi.fn(async () => {});
    vi.doMock('sandbox', () => ({ createApp: () => ({ run }) }));
    const { default: sandbox } = await import(
      '../../../../src/commands/sandbox'
    );

    client.setArgv('sandbox', '--help');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(run).toHaveBeenCalledWith(['--help']);
  });

  it('wires the dispatcher through getSubcommand and SandboxTelemetryClient', async () => {
    vi.resetModules();
    client.reset();
    const run = vi.fn(async () => {});
    vi.doMock('sandbox', () => ({ createApp: () => ({ run }) }));

    const actualGetSubcommand = await vi.importActual<
      typeof import('../../../../src/util/get-subcommand')
    >('../../../../src/util/get-subcommand');
    const getSubcommandSpy = vi.fn(actualGetSubcommand.default);
    vi.doMock('../../../../src/util/get-subcommand', () => ({
      default: getSubcommandSpy,
    }));

    const telemetryConstructorSpy = vi.fn();
    vi.doMock('../../../../src/util/telemetry/commands/sandbox', () => ({
      SandboxTelemetryClient: class {
        constructor(opts: unknown) {
          telemetryConstructorSpy(opts);
        }
      },
    }));

    const { default: sandbox } = await import(
      '../../../../src/commands/sandbox'
    );

    client.setArgv('sandbox', 'list');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(getSubcommandSpy).toHaveBeenCalledWith(['list'], {
      exec: ['exec'],
      create: ['create'],
      connect: ['connect', 'ssh', 'shell'],
      sh: ['sh'],
      fork: ['fork'],
      run: ['run'],
    });
    expect(telemetryConstructorSpy).toHaveBeenCalledWith({
      opts: { store: client.telemetryEventStore },
    });
    expect(run).toHaveBeenCalledWith(['list']);

    vi.doUnmock('../../../../src/util/get-subcommand');
    vi.doUnmock('../../../../src/util/telemetry/commands/sandbox');
  });

  it('routes exec to the native handler instead of the pass-through', async () => {
    vi.resetModules();
    client.reset();
    const run = vi.fn(async () => {});
    vi.doMock('sandbox', () => ({ createApp: () => ({ run }) }));

    const execHandler = vi.fn(async () => 0);
    vi.doMock('../../../../src/commands/sandbox/exec', () => ({
      default: execHandler,
    }));

    const { default: sandbox } = await import(
      '../../../../src/commands/sandbox'
    );

    client.setArgv('sandbox', 'exec', 'my-sandbox', '--', 'echo', 'hi');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(execHandler).toHaveBeenCalledWith(
      client,
      expect.arrayContaining(['my-sandbox', 'echo', 'hi'])
    );
    expect(run).not.toHaveBeenCalled();

    vi.doUnmock('../../../../src/commands/sandbox/exec');
  });

  it('routes create to the native handler instead of the pass-through', async () => {
    vi.resetModules();
    client.reset();
    const run = vi.fn(async () => {});
    vi.doMock('sandbox', () => ({ createApp: () => ({ run }) }));

    const createHandler = vi.fn(async () => 0);
    vi.doMock('../../../../src/commands/sandbox/create', () => ({
      default: createHandler,
    }));

    const { default: sandbox } = await import(
      '../../../../src/commands/sandbox'
    );

    client.setArgv('sandbox', 'create', '--connect');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(createHandler).toHaveBeenCalledWith(
      client,
      expect.arrayContaining(['--connect'])
    );
    expect(run).not.toHaveBeenCalled();

    vi.doUnmock('../../../../src/commands/sandbox/create');
  });

  it.each([
    'connect',
    'ssh',
    'shell',
  ])('routes %s to the native connect handler instead of the pass-through', async invokedAs => {
    vi.resetModules();
    client.reset();
    const run = vi.fn(async () => {});
    vi.doMock('sandbox', () => ({ createApp: () => ({ run }) }));

    const connectHandler = vi.fn(async () => 0);
    vi.doMock('../../../../src/commands/sandbox/connect', () => ({
      default: connectHandler,
    }));

    const { default: sandbox } = await import(
      '../../../../src/commands/sandbox'
    );

    client.setArgv('sandbox', invokedAs, 'my-sandbox');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(connectHandler).toHaveBeenCalledWith(
      client,
      expect.arrayContaining(['my-sandbox'])
    );
    expect(run).not.toHaveBeenCalled();

    vi.doUnmock('../../../../src/commands/sandbox/connect');
  });

  it('routes sh to the native handler instead of the pass-through', async () => {
    vi.resetModules();
    client.reset();
    const run = vi.fn(async () => {});
    vi.doMock('sandbox', () => ({ createApp: () => ({ run }) }));

    const shHandler = vi.fn(async () => 0);
    vi.doMock('../../../../src/commands/sandbox/sh', () => ({
      default: shHandler,
    }));

    const { default: sandbox } = await import(
      '../../../../src/commands/sandbox'
    );

    client.setArgv('sandbox', 'sh', '--runtime', 'node22');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(shHandler).toHaveBeenCalledWith(
      client,
      expect.arrayContaining(['--runtime', 'node22'])
    );
    expect(run).not.toHaveBeenCalled();

    vi.doUnmock('../../../../src/commands/sandbox/sh');
  });

  it('routes fork to the native handler instead of the pass-through', async () => {
    vi.resetModules();
    client.reset();
    const run = vi.fn(async () => {});
    vi.doMock('sandbox', () => ({ createApp: () => ({ run }) }));

    const forkHandler = vi.fn(async () => 0);
    vi.doMock('../../../../src/commands/sandbox/fork', () => ({
      default: forkHandler,
    }));

    const { default: sandbox } = await import(
      '../../../../src/commands/sandbox'
    );

    client.setArgv('sandbox', 'fork', 'my-source', '--vcpus', '4');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(forkHandler).toHaveBeenCalledWith(
      client,
      expect.arrayContaining(['my-source', '--vcpus', '4'])
    );
    expect(run).not.toHaveBeenCalled();

    vi.doUnmock('../../../../src/commands/sandbox/fork');
  });

  it('routes run to the native handler instead of the pass-through', async () => {
    vi.resetModules();
    client.reset();
    const run = vi.fn(async () => {});
    vi.doMock('sandbox', () => ({ createApp: () => ({ run }) }));

    const runHandler = vi.fn(async () => 0);
    vi.doMock('../../../../src/commands/sandbox/run', () => ({
      default: runHandler,
    }));

    const { default: sandbox } = await import(
      '../../../../src/commands/sandbox'
    );

    client.setArgv('sandbox', 'run', '--rm', '--', 'echo', 'hi');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(runHandler).toHaveBeenCalledWith(
      client,
      expect.arrayContaining(['--rm', 'echo', 'hi'])
    );
    expect(run).not.toHaveBeenCalled();

    vi.doUnmock('../../../../src/commands/sandbox/run');
  });

  it('returns 1 and prints the error when the pass-through throws', async () => {
    vi.resetModules();
    client.reset();
    const run = vi.fn(async () => {
      throw new Error('boom');
    });
    vi.doMock('sandbox', () => ({ createApp: () => ({ run }) }));
    const { default: sandbox } = await import(
      '../../../../src/commands/sandbox'
    );

    client.setArgv('sandbox', 'list');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(1);
  });
});
