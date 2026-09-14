import { afterEach, describe, expect, it, vi } from 'vitest';
import kms from '../../../../src/commands/kms';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useCreateIssuer, useKmsError } from '../../../mocks/kms';

describe('kms add', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('kms', 'add', '--help');
      const exitCodePromise = kms(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'kms:add' },
      ]);
    });
  });

  it('creates an issuer and shows how to grant a project access', async () => {
    useUser();
    useCreateIssuer();
    client.setArgv('kms', 'add', 'my-issuer');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('my-issuer');
    expect(stderr).toContain('kms add-grant');
  });

  it('tracks the redacted name and the algorithm', async () => {
    useUser();
    useCreateIssuer();
    client.setArgv('kms', 'add', 'my-issuer', '--algorithm', 'ES256');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:add', value: 'add' },
      { key: 'argument:name', value: '[REDACTED]' },
      { key: 'option:algorithm', value: 'ES256' },
    ]);
  });

  it('rejects an unsupported algorithm before calling the API', async () => {
    useUser();
    client.setArgv('kms', 'add', 'my-issuer', '--algorithm', 'HS256');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid algorithm "HS256"');
  });

  it('does not accept a key to import', async () => {
    useUser();
    client.setArgv('kms', 'add', 'my-issuer', '--key', './private-key.pem');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('unknown or unexpected option: --key');
  });

  it('rejects malformed --claims-schema JSON', async () => {
    useUser();
    client.setArgv('kms', 'add', 'my-issuer', '--claims-schema', '{nope');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid JSON for --claims-schema');
  });

  describe('--format json', () => {
    it('writes the issuer to stdout', async () => {
      useUser();
      useCreateIssuer();
      client.setArgv('kms', 'add', 'my-issuer', '--format', 'json');
      const exitCode = await kms(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({ name: 'my-issuer' });
    });
  });

  describe('non-interactive', () => {
    it('emits an agent payload when the name is missing', async () => {
      vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('kms', 'add');
      await expect(kms(client)).rejects.toThrow('exit');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_name',
      });
    });

    it('emits a success payload with the grant follow-up', async () => {
      useUser();
      useCreateIssuer();
      client.nonInteractive = true;
      client.setArgv('kms', 'add', 'my-issuer');
      const exitCode = await kms(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('ok');
      expect(payload.next[0].command).toContain('kms add-grant');
    });
  });

  it('explains a 403 as a permissions problem', async () => {
    useUser();
    useKmsError(
      { method: 'post', path: '/v1/kms/issuers' },
      403,
      'forbidden',
      'Not authorized'
    );
    client.setArgv('kms', 'add', 'my-issuer');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('requires the Owner role');
  });
});
