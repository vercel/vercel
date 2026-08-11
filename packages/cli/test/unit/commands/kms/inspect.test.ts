import { afterEach, describe, expect, it, vi } from 'vitest';
import kms from '../../../../src/commands/kms';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import {
  createProjectGrant,
  createSigningKey,
  useIssuer,
  useIssuerNotFound,
} from '../../../mocks/kms';

describe('kms inspect', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('kms', 'inspect', '--help');
      const exitCodePromise = kms(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'kms:inspect' },
      ]);
    });
  });

  it('shows the issuer, its keys, and its grants', async () => {
    useUser();
    useIssuer('iss_test', {
      signingKeys: [createSigningKey({ issuerId: 'iss_test', keyId: 'key_1' })],
      policies: [createProjectGrant({ projectId: 'prj_1' })],
    });
    client.setArgv('kms', 'inspect', 'iss_test');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('iss_test');
    expect(stderr).toContain('key_1');
    expect(stderr).toContain('prj_1');
  });

  it('does not claim an issuer has no grants when they are hidden', async () => {
    useUser();
    useIssuer('iss_test', { policies: [] });
    client.setArgv('kms', 'inspect', 'iss_test');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No grants visible');
  });

  it('tracks the redacted issuer ID', async () => {
    useUser();
    useIssuer('iss_test');
    client.setArgv('kms', 'inspect', 'iss_test');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:inspect', value: 'inspect' },
      { key: 'argument:issuerId', value: '[REDACTED]' },
    ]);
  });

  it('reports a missing issuer', async () => {
    useUser();
    useIssuerNotFound('iss_missing');
    client.setArgv('kms', 'inspect', 'iss_missing');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Issuer not found: iss_missing.');
  });

  describe('--format json', () => {
    it('writes the issuer to stdout', async () => {
      useUser();
      useIssuer('iss_test');
      client.setArgv('kms', 'inspect', 'iss_test', '--format', 'json');
      const exitCode = await kms(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({ id: 'iss_test', algorithm: 'RS256' });
    });
  });

  describe('non-interactive', () => {
    it('emits an agent payload when the issuer ID is missing', async () => {
      vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('kms', 'inspect');
      await expect(kms(client)).rejects.toThrow('exit');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_issuer_id',
      });
      expect(payload.next[1].command).toBe('vercel kms inspect <issuerId>');
    });
  });
});
