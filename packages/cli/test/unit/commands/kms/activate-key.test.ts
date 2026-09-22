import { afterEach, describe, expect, it, vi } from 'vitest';
import kms from '../../../../src/commands/kms';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useActivateSigningKey, useKmsError } from '../../../mocks/kms';

describe('kms activate-key', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('kms', 'activate-key', '--help');
      const exitCodePromise = kms(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'kms:activate-key' },
      ]);
    });
  });

  it('activates a staged key', async () => {
    useUser();
    useActivateSigningKey('iss_test', 'key_1');
    client.setArgv('kms', 'activate-key', 'iss_test', 'key_1');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Activated');
    expect(stderr).toContain('key_1');
  });

  it('tracks both arguments and the grace period', async () => {
    useUser();
    useActivateSigningKey('iss_test', 'key_1');
    client.setArgv(
      'kms',
      'activate-key',
      'iss_test',
      'key_1',
      '--revoke-previous-after-hours',
      '4'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:activate-key', value: 'activate-key' },
      { key: 'argument:issuerId', value: '[REDACTED]' },
      { key: 'argument:keyId', value: '[REDACTED]' },
      { key: 'option:revoke-previous-after-hours', value: '4' },
    ]);
  });

  it('reports a missing key', async () => {
    useUser();
    useKmsError(
      {
        method: 'post',
        path: '/v1/kms/issuers/iss_test/keys/key_missing/activate',
      },
      404,
      'not_found',
      'Key not found'
    );
    client.setArgv('kms', 'activate-key', 'iss_test', 'key_missing');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Key not found: key_missing on issuer iss_test.'
    );
  });

  describe('non-interactive', () => {
    it('emits an agent payload when the key ID is missing', async () => {
      vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('kms', 'activate-key', 'iss_test');
      await expect(kms(client)).rejects.toThrow('exit');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_key_id',
      });
    });
  });
});
