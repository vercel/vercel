import { afterEach, describe, expect, it, vi } from 'vitest';
import kms from '../../../../src/commands/kms';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import {
  useCreateSigningKey,
  useIssuer,
  useIssuerNotFound,
  useKmsError,
} from '../../../mocks/kms';

describe('kms add-key', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('kms', 'add-key', '--help');
      const exitCodePromise = kms(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'kms:add-key' },
      ]);
    });
  });

  it('adds a key and explains when it starts signing', async () => {
    useUser();
    useIssuer('iss_test');
    useCreateSigningKey('iss_test', { keyId: 'key_new' });
    client.setArgv('kms', 'add-key', 'iss_test');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('key_new');
    expect(stderr).toContain('starts signing');
  });

  it('tells the user to activate a staged key', async () => {
    useUser();
    useIssuer('iss_test');
    useCreateSigningKey('iss_test', { keyId: 'key_new', status: 'pending' });
    client.setArgv('kms', 'add-key', 'iss_test', '--activation', 'manual');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('kms activate-key iss_test key_new');
  });

  it('rejects an unknown activation mode', async () => {
    useUser();
    client.setArgv('kms', 'add-key', 'iss_test', '--activation', 'later');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid activation mode "later"');
  });

  it('rejects a negative grace period', async () => {
    useUser();
    client.setArgv(
      'kms',
      'add-key',
      'iss_test',
      '--revoke-previous-after-hours=-1'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      '--revoke-previous-after-hours must be 0 or more'
    );
  });

  it('rejects a non-numeric grace period instead of sending null', async () => {
    useUser();
    client.setArgv(
      'kms',
      'add-key',
      'iss_test',
      '--revoke-previous-after-hours=soon'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      '--revoke-previous-after-hours must be a number of hours'
    );
  });

  it('sends the user to import-key for an imported issuer', async () => {
    useUser();
    useIssuer('iss_external', { origin: 'external' });
    client.setArgv('kms', 'add-key', 'iss_external');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('was created from a key you imported');
    expect(stderr).toContain('kms import-key iss_external');
  });

  it('tracks options without recording the key material', async () => {
    useUser();
    useIssuer('iss_test');
    useCreateSigningKey('iss_test');
    client.setArgv(
      'kms',
      'add-key',
      'iss_test',
      '--activation',
      'automatic',
      '--revoke-previous-after-hours',
      '2'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:add-key', value: 'add-key' },
      { key: 'argument:issuerId', value: '[REDACTED]' },
      { key: 'option:activation', value: 'automatic' },
      { key: 'option:revoke-previous-after-hours', value: '2' },
    ]);
  });

  describe('non-interactive', () => {
    it('emits an agent payload when the issuer ID is missing', async () => {
      vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('kms', 'add-key');
      await expect(kms(client)).rejects.toThrow('exit');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_issuer_id',
      });
    });

    it('emits the origin mismatch as a structured error', async () => {
      vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      useUser();
      useIssuer('iss_external', { origin: 'external' });
      client.nonInteractive = true;
      client.setArgv('kms', 'add-key', 'iss_external');
      await expect(kms(client)).rejects.toThrow('exit');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'issuer_requires_imported_key',
      });
      expect(payload.next[0].command).toContain('kms import-key iss_external');
    });
  });

  it('reports a missing issuer', async () => {
    useUser();
    useIssuerNotFound('iss_missing');
    client.setArgv('kms', 'add-key', 'iss_missing');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Issuer not found: iss_missing.');
  });

  it('explains a 403 on the key route as a permissions problem', async () => {
    useUser();
    useIssuer('iss_test');
    useKmsError(
      { method: 'post', path: '/v1/kms/issuers/iss_test/keys' },
      403,
      'forbidden',
      'Not authorized'
    );
    client.setArgv('kms', 'add-key', 'iss_test');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('requires the Owner role');
  });
});
