import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import drains from '../../../../src/commands/drains';
import { useUser } from '../../../mocks/user';
import { useDrains } from '../../../mocks/drains';

describe('drains rm', () => {
  beforeEach(() => {
    useUser();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('drains', 'rm', '--help');
      const exitCodePromise = drains(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'drains:rm',
        },
      ]);
    });
  });

  it('errors when no id is passed', async () => {
    client.setArgv('drains', 'rm');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Please provide a drain id');
  });

  it('removes the drain with --yes', async () => {
    useDrains();
    client.setArgv('drains', 'rm', 'drn_1', '--yes');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('removed');
  });

  it('asks for confirmation and removes on yes', async () => {
    useDrains();
    client.setArgv('drains', 'rm', 'drn_1');
    const exitCodePromise = drains(client);

    await expect(client.stderr).toOutput(
      'The following drain will be removed permanently'
    );
    client.stdin.write('y\n');

    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('does nothing when the user declines', async () => {
    useDrains();
    client.setArgv('drains', 'rm', 'drn_1');
    const exitCodePromise = drains(client);

    await expect(client.stderr).toOutput('Are you sure?');
    client.stdin.write('n\n');

    await expect(exitCodePromise).resolves.toEqual(0);
    await expect(client.stderr).toOutput('User canceled.');
  });

  it('removes the drain and reports JSON with --format json', async () => {
    useDrains();
    client.setArgv('drains', 'rm', 'drn_1', '--yes', '--format', 'json');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed).toEqual({ removed: true, id: 'drn_1' });
  });

  it('requires --yes in non-interactive mode', async () => {
    useDrains();
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as () => never);
    client.nonInteractive = true;
    client.setArgv('drains', 'rm', 'drn_1');

    await expect(drains(client)).rejects.toThrow('exit:1');
    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload.reason).toBe('confirmation_required');
    expect(payload.next?.[0]?.command).toContain('--yes');
  });
});
