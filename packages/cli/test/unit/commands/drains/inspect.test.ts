import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import drains from '../../../../src/commands/drains';
import { useUser } from '../../../mocks/user';
import { useDrains } from '../../../mocks/drains';

describe('drains inspect', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('drains', 'inspect', '--help');
      const exitCodePromise = drains(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'drains:inspect',
        },
      ]);
    });
  });

  it('errors when no id is passed', async () => {
    client.setArgv('drains', 'inspect');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Please provide a drain id');
  });

  it('shows the drain and hides the secret and header values', async () => {
    useDrains();
    client.setArgv('drains', 'inspect', 'drn_1');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    const output =
      client.stdout.getFullOutput() + client.stderr.getFullOutput();
    expect(output).toContain('prod-logs');
    expect(output).toContain('log (v1)');
    expect(output).toContain('Active');
    expect(output).toContain('Hidden');
    expect(output).not.toContain('whsec_do_not_leak');
    expect(output).not.toContain('sk_do_not_leak');
  });

  it('maps a 404 to a not-found message', async () => {
    client.scenario.get('/v1/drains/drn_missing', (_req, res) => {
      res.status(404).json({ error: { code: 'not_found', message: 'nope' } });
    });
    client.setArgv('drains', 'inspect', 'drn_missing');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Drain not found.');
  });

  it('redacts the secret in JSON', async () => {
    useDrains();
    client.setArgv('drains', 'inspect', 'drn_1', '--json');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    const stdout = client.stdout.getFullOutput();
    expect(stdout).not.toContain('whsec_do_not_leak');
    const parsed = JSON.parse(stdout);
    expect('secret' in parsed.delivery).toBe(false);
    expect(parsed.delivery.headers.Authorization).toBeNull();
  });
});
