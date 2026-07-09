import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { shSubcommand } from '../../../../src/commands/sandbox/sh/command';

const { runCreate } = vi.hoisted(() => ({
  runCreate: vi.fn(),
}));

vi.mock('../../../../src/commands/sandbox/create', async importActual => {
  const actual =
    await importActual<
      typeof import('../../../../src/commands/sandbox/create')
    >();
  return { ...actual, runCreate };
});

const fakeSandbox = { name: 'my-sandbox' } as any;

describe('sandbox sh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    runCreate.mockResolvedValue(fakeSandbox);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the create flags minus --connect', () => {
    const names = shSubcommand.options.map(option => String(option.name));
    expect(names).toContain('runtime');
    expect(names).toContain('network-policy');
    expect(names).not.toContain('connect');
  });

  it('prints help and returns 2 for --help', async () => {
    const { default: sh } = await import('../../../../src/commands/sandbox/sh');
    const exitCode = await sh(client, ['--help']);
    expect(exitCode).toBe(2);
    expect(runCreate).not.toHaveBeenCalled();
  });

  it('runs the create flow with connect forced true and the parsed flags', async () => {
    const { default: sh } = await import('../../../../src/commands/sandbox/sh');
    const exitCode = await sh(client, [
      '--runtime',
      'node22',
      '--network-policy',
      'deny-all',
    ]);

    expect(exitCode).toBe(0);
    expect(runCreate).toHaveBeenCalledTimes(1);
    expect(runCreate).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        connect: true,
        runtime: 'node22',
        networkPolicy: 'deny-all',
      })
    );
  });

  it('returns 1 when parsing fails', async () => {
    const { default: sh } = await import('../../../../src/commands/sandbox/sh');
    const exitCode = await sh(client, ['--connect']);
    expect(exitCode).toBe(1);
    expect(runCreate).not.toHaveBeenCalled();
  });
});
