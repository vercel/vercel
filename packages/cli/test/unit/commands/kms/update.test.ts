import { describe, expect, it } from 'vitest';
import kms from '../../../../src/commands/kms';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useManagedIssuerRejection, useUpdateIssuer } from '../../../mocks/kms';

describe('kms update', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('kms', 'update', '--help');
      const exitCodePromise = kms(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'kms:update' },
      ]);
    });
  });

  it('renames an issuer', async () => {
    useUser();
    useUpdateIssuer('iss_test');
    client.setArgv('kms', 'update', 'iss_test', '--name', 'renamed');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('renamed');
  });

  it('clears the claims schema with --remove-claims-schema', async () => {
    useUser();
    useUpdateIssuer('iss_test', { claimsSchema: { type: 'object' } });
    client.setArgv('kms', 'update', 'iss_test', '--remove-claims-schema');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:update', value: 'update' },
      { key: 'argument:issuerId', value: '[REDACTED]' },
      { key: 'flag:remove-claims-schema', value: 'TRUE' },
    ]);
  });

  it('rejects conflicting claims-schema flags', async () => {
    useUser();
    client.setArgv(
      'kms',
      'update',
      'iss_test',
      '--claims-schema',
      '{}',
      '--remove-claims-schema'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      '--claims-schema and --remove-claims-schema conflict'
    );
  });

  it('requires at least one change', async () => {
    useUser();
    client.setArgv('kms', 'update', 'iss_test');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Nothing to update');
  });

  it('explains that a managed issuer cannot be changed here', async () => {
    useUser();
    useManagedIssuerRejection('iss_managed');
    client.setArgv('kms', 'update', 'iss_managed', '--name', 'renamed');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'provisioned by another Vercel service'
    );
  });
});
