import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import kms from '../../../../src/commands/kms';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import {
  useCreateSigningKey,
  useIssuer,
  useIssuerNotFound,
} from '../../../mocks/kms';

const PEM = '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n';

describe('kms import-key', () => {
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'kms-import-key-'));
    writeFileSync(join(dir, 'private-key.pem'), PEM);
    client.cwd = dir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('kms', 'import-key', '--help');
      const exitCodePromise = kms(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'kms:import-key' },
      ]);
    });
  });

  it('imports a key into an imported issuer', async () => {
    useUser();
    useIssuer('iss_external', { origin: 'external' });
    useCreateSigningKey('iss_external', { keyId: 'key_new' });
    client.setArgv(
      'kms',
      'import-key',
      'iss_external',
      '--key',
      'private-key.pem'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('key_new');
    expect(stderr).toContain('starts signing');
  });

  it('tells the user to activate a staged key', async () => {
    useUser();
    useIssuer('iss_external', { origin: 'external' });
    useCreateSigningKey('iss_external', {
      keyId: 'key_new',
      status: 'pending',
    });
    client.setArgv(
      'kms',
      'import-key',
      'iss_external',
      '--key',
      'private-key.pem',
      '--activation',
      'manual'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      'kms activate-key iss_external key_new'
    );
  });

  it('requires a key', async () => {
    useUser();
    client.setArgv('kms', 'import-key', 'iss_external');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('A private key is required.');
  });

  it('rejects a key path that does not exist', async () => {
    useUser();
    client.setArgv(
      'kms',
      'import-key',
      'iss_external',
      '--key',
      'missing-key.pem'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput("Couldn't read --key file");
  });

  it('sends the user to add-key for a Vercel-generated issuer', async () => {
    useUser();
    useIssuer('iss_test');
    client.setArgv('kms', 'import-key', 'iss_test', '--key', 'private-key.pem');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Vercel generates the signing keys');
    expect(stderr).toContain('kms add-key iss_test');
  });

  it('tracks options without recording the key material', async () => {
    useUser();
    useIssuer('iss_external', { origin: 'external' });
    useCreateSigningKey('iss_external');
    client.setArgv(
      'kms',
      'import-key',
      'iss_external',
      '--key',
      'private-key.pem',
      '--key-id',
      'kid-1',
      '--revoke-previous-after-hours',
      '2'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:import-key', value: 'import-key' },
      { key: 'argument:issuerId', value: '[REDACTED]' },
      { key: 'option:key', value: '[REDACTED]' },
      { key: 'option:key-id', value: '[REDACTED]' },
      { key: 'option:revoke-previous-after-hours', value: '2' },
    ]);
  });

  describe('non-interactive', () => {
    it('emits an agent payload when the key is missing', async () => {
      vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('kms', 'import-key', 'iss_external');
      await expect(kms(client)).rejects.toThrow('exit');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_key',
      });
    });

    it('emits the origin mismatch as a structured error', async () => {
      vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      useUser();
      useIssuer('iss_test');
      client.nonInteractive = true;
      client.setArgv(
        'kms',
        'import-key',
        'iss_test',
        '--key',
        'private-key.pem'
      );
      await expect(kms(client)).rejects.toThrow('exit');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'issuer_requires_generated_key',
      });
      expect(payload.next[0].command).toContain('kms add-key iss_test');
    });
  });

  it('reports a missing issuer', async () => {
    useUser();
    useIssuerNotFound('iss_missing');
    client.setArgv(
      'kms',
      'import-key',
      'iss_missing',
      '--key',
      'private-key.pem'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Issuer not found: iss_missing.');
  });
});
