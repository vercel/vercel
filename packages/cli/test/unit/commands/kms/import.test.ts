import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import kms from '../../../../src/commands/kms';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useCreateIssuer, useKmsError } from '../../../mocks/kms';

// The CLI only checks that the file looks like PEM; the API validates the key.
const PEM = '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n';

describe('kms import', () => {
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'kms-import-'));
    writeFileSync(join(dir, 'private-key.pem'), PEM);
    client.cwd = dir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('kms', 'import', '--help');
      const exitCodePromise = kms(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'kms:import' },
      ]);
    });
  });

  it('imports an issuer and says later keys are imported too', async () => {
    useUser();
    useCreateIssuer();
    client.setArgv('kms', 'import', 'my-issuer', '--key', 'private-key.pem');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('my-issuer');
    expect(stderr).toContain('external');
    expect(stderr).toContain('kms import-key');
    expect(stderr).toContain('kms add-grant');
  });

  it('reads the key from stdin', async () => {
    useUser();
    useCreateIssuer();
    client.stdin.isTTY = false;
    client.stdin.end(PEM);
    client.setArgv('kms', 'import', 'my-issuer', '--key', '-');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('my-issuer');
  });

  it('requires a key', async () => {
    useUser();
    client.setArgv('kms', 'import', 'my-issuer');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('A private key is required.');
  });

  it('rejects a key path that does not exist', async () => {
    useUser();
    client.setArgv('kms', 'import', 'my-issuer', '--key', 'missing-key.pem');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput("Couldn't read --key file");
  });

  it('rejects a file that is not PEM', async () => {
    useUser();
    writeFileSync(join(client.cwd, 'not-a-key.txt'), 'hello');
    client.setArgv('kms', 'import', 'my-issuer', '--key', 'not-a-key.txt');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      '--key must be a PEM-encoded private key'
    );
  });

  it('rejects an unsupported algorithm before reading the key', async () => {
    useUser();
    client.setArgv(
      'kms',
      'import',
      'my-issuer',
      '--key',
      'private-key.pem',
      '--algorithm',
      'HS256'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid algorithm "HS256"');
  });

  it('sends the JWKS kid through and keeps the key material out of telemetry', async () => {
    useUser();
    useCreateIssuer();
    client.setArgv(
      'kms',
      'import',
      'my-issuer',
      '--key',
      'private-key.pem',
      '--key-id',
      'kid-1',
      '--algorithm',
      'RS256'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('kid-1');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:import', value: 'import' },
      { key: 'argument:name', value: '[REDACTED]' },
      { key: 'option:key', value: '[REDACTED]' },
      { key: 'option:key-id', value: '[REDACTED]' },
      { key: 'option:algorithm', value: 'RS256' },
    ]);
  });

  describe('non-interactive', () => {
    it('emits an agent payload when the key is missing', async () => {
      vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('kms', 'import', 'my-issuer');
      await expect(kms(client)).rejects.toThrow('exit');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_key',
      });
    });

    it('emits a success payload with the grant follow-up', async () => {
      useUser();
      useCreateIssuer();
      client.nonInteractive = true;
      client.setArgv('kms', 'import', 'my-issuer', '--key', 'private-key.pem');
      const exitCode = await kms(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('ok');
      expect(payload.issuer.origin).toBe('external');
      expect(payload.next[0].command).toContain('kms add-grant');
    });
  });

  it('surfaces a key the API rejects', async () => {
    useUser();
    useKmsError(
      { method: 'post', path: '/v1/kms/issuers' },
      400,
      'invalid_signing_key_algorithm',
      'algorithm is required when it cannot be derived from privateKey'
    );
    client.setArgv('kms', 'import', 'my-issuer', '--key', 'private-key.pem');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('algorithm is required');
  });
});
