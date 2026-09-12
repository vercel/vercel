import { afterEach, describe, expect, it, vi } from 'vitest';
import kms from '../../../../src/commands/kms';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import {
  useDeleteIssuer,
  useIssuer,
  useIssuerForbidden,
} from '../../../mocks/kms';

describe('kms rm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('kms', 'rm', '--help');
      const exitCodePromise = kms(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'kms:rm' },
      ]);
    });
  });

  it('confirms before deleting', async () => {
    useUser();
    useIssuer('iss_test', { name: 'my-issuer' });
    useDeleteIssuer('iss_test');
    client.setArgv('kms', 'rm', 'iss_test');
    const exitCodePromise = kms(client);
    await expect(client.stderr).toOutput('Delete');
    client.stdin.write('y\n');
    await expect(exitCodePromise).resolves.toEqual(0);
    await expect(client.stderr).toOutput('Removed');
  });

  it('cancels when the prompt is declined', async () => {
    useUser();
    useIssuer('iss_test');
    client.setArgv('kms', 'rm', 'iss_test');
    const exitCodePromise = kms(client);
    await expect(client.stderr).toOutput('Delete');
    client.stdin.write('n\n');
    await expect(exitCodePromise).resolves.toEqual(0);
    await expect(client.stderr).toOutput('Canceled');
  });

  it('skips the prompt with --yes and tracks the flag', async () => {
    useUser();
    useIssuer('iss_test');
    useDeleteIssuer('iss_test');
    client.setArgv('kms', 'rm', 'iss_test', '--yes');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:remove', value: 'rm' },
      { key: 'argument:issuerId', value: '[REDACTED]' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });

  it('explains a 403 as a permissions problem', async () => {
    useUser();
    useIssuer('iss_test');
    useIssuerForbidden('iss_test');
    client.setArgv('kms', 'rm', 'iss_test', '--yes');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('requires the Owner role');
  });

  describe('non-interactive', () => {
    it('requires --yes', async () => {
      useUser();
      useIssuer('iss_test');
      vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('kms', 'rm', 'iss_test');
      await expect(kms(client)).rejects.toThrow('exit');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'confirmation_required',
      });
      expect(payload.next[0].command).toBe('vercel kms rm iss_test --yes');
    });

    it('emits a success payload with --yes', async () => {
      useUser();
      useIssuer('iss_test', { name: 'my-issuer' });
      useDeleteIssuer('iss_test');
      client.nonInteractive = true;
      client.setArgv('kms', 'rm', 'iss_test', '--yes');
      const exitCode = await kms(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'ok',
        issuer: { id: 'iss_test', name: 'my-issuer' },
      });
    });
  });
});
