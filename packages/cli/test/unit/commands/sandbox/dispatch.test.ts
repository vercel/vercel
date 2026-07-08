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

    client.setArgv('sandbox', 'create', '--connect');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(0);
    expect(run).toHaveBeenCalledWith(
      expect.arrayContaining(['create', '--connect'])
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
    expect(getSubcommandSpy).toHaveBeenCalledWith(['list'], {});
    expect(telemetryConstructorSpy).toHaveBeenCalledWith({
      opts: { store: client.telemetryEventStore },
    });
    expect(run).toHaveBeenCalledWith(['list']);

    vi.doUnmock('../../../../src/util/get-subcommand');
    vi.doUnmock('../../../../src/util/telemetry/commands/sandbox');
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

    client.setArgv('sandbox', 'create');
    const exitCode = await sandbox(client);

    expect(exitCode).toBe(1);
  });
});
