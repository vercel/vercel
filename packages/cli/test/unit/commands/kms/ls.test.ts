import { describe, expect, it } from 'vitest';
import kms from '../../../../src/commands/kms';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useIssuers, useKmsError } from '../../../mocks/kms';

describe('kms ls', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('kms', 'ls', '--help');
      const exitCodePromise = kms(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'kms:ls',
        },
      ]);
    });
  });

  it('lists issuers', async () => {
    useUser();
    useIssuers(3);
    client.setArgv('kms', 'ls');
    const exitCode = await kms(client);
    expect(exitCode, 'exit code for "kms ls"').toEqual(0);
    await expect(client.stderr).toOutput('3 issuers found');
  });

  it('tracks the subcommand and its options', async () => {
    useUser();
    useIssuers(1);
    client.setArgv('kms', 'ls', '--limit', '5', '--format', 'json');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:list', value: 'ls' },
      { key: 'option:format', value: 'json' },
      { key: 'option:limit', value: '5' },
    ]);
  });

  it('points at the next page when the API returns a cursor', async () => {
    useUser();
    useIssuers(2, 'Y3Vyc29y');
    client.setArgv('kms', 'ls');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('--next Y3Vyc29y');
  });

  it('suggests creating an issuer when there are none', async () => {
    useUser();
    useIssuers(0);
    client.setArgv('kms', 'ls');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No issuers found');
  });

  describe('--format json', () => {
    it('writes issuers and pagination to stdout', async () => {
      useUser();
      useIssuers(2);
      client.setArgv('kms', 'ls', '--format', 'json');
      const exitCode = await kms(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.issuers).toHaveLength(2);
      expect(payload.pagination).toMatchObject({ count: 2 });
    });
  });

  describe('non-interactive', () => {
    it('emits an agent payload with a plain next command', async () => {
      useUser();
      useIssuers(0);
      client.nonInteractive = true;
      client.setArgv('kms', 'ls');
      const exitCode = await kms(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'ok',
        issuers: [],
        message: '0 issuers found.',
      });
      expect(payload.next[0].command).toBe('vercel kms inspect <issuerId>');
    });
  });

  it('explains a 403 as a permissions problem', async () => {
    useUser();
    useKmsError(
      { method: 'get', path: '/v1/kms/issuers' },
      403,
      'forbidden',
      'Not authorized'
    );
    client.setArgv('kms', 'ls');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('requires the Owner role');
  });
});
