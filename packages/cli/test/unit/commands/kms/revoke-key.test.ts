import { afterEach, describe, expect, it, vi } from 'vitest';
import kms from '../../../../src/commands/kms';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import {
  createSigningKey,
  useIssuer,
  useRevokeSigningKey,
} from '../../../mocks/kms';

function useRevokingIssuer(issuerId: string, keyId: string) {
  return useIssuer(issuerId, {
    signingKeys: [
      createSigningKey({
        issuerId,
        keyId,
        status: 'revoking',
        revokeAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    ],
  });
}

describe('kms revoke-key', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('kms', 'revoke-key', '--help');
      const exitCodePromise = kms(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'kms:revoke-key' },
      ]);
    });
  });

  it('revokes a key that is already retiring', async () => {
    useUser();
    useRevokingIssuer('iss_test', 'key_old');
    useRevokeSigningKey('iss_test', 'key_old');
    client.setArgv('kms', 'revoke-key', 'iss_test', 'key_old', '--yes');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Revoked');
  });

  it('confirms before revoking', async () => {
    useUser();
    useRevokingIssuer('iss_test', 'key_old');
    useRevokeSigningKey('iss_test', 'key_old');
    client.setArgv('kms', 'revoke-key', 'iss_test', 'key_old');
    const exitCodePromise = kms(client);
    await expect(client.stderr).toOutput('Revoke');
    client.stdin.write('y\n');
    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('refuses to revoke an active key', async () => {
    useUser();
    useIssuer('iss_test', {
      signingKeys: [createSigningKey({ issuerId: 'iss_test', keyId: 'key_1' })],
    });
    client.setArgv('kms', 'revoke-key', 'iss_test', 'key_1', '--yes');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('not scheduled for revocation');
  });

  it('reports a key that is not on the issuer', async () => {
    useUser();
    useIssuer('iss_test');
    client.setArgv('kms', 'revoke-key', 'iss_test', 'key_missing', '--yes');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Key not found: key_missing');
  });

  describe('non-interactive', () => {
    it('requires --yes', async () => {
      useUser();
      useRevokingIssuer('iss_test', 'key_old');
      vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('kms', 'revoke-key', 'iss_test', 'key_old');
      await expect(kms(client)).rejects.toThrow('exit');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'confirmation_required',
      });
    });

    it('emits a success payload with --yes', async () => {
      useUser();
      useRevokingIssuer('iss_test', 'key_old');
      useRevokeSigningKey('iss_test', 'key_old');
      client.nonInteractive = true;
      client.setArgv('kms', 'revoke-key', 'iss_test', 'key_old', '--yes');
      const exitCode = await kms(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({ status: 'ok' });
      expect(payload.message).toContain('key_old');
    });
  });
});
