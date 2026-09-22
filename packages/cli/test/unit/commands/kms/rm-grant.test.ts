import { afterEach, describe, expect, it, vi } from 'vitest';
import kms from '../../../../src/commands/kms';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import {
  createProjectGrant,
  useDeleteProjectGrant,
  useIssuer,
  useKmsError,
} from '../../../mocks/kms';

describe('kms rm-grant', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('kms', 'rm-grant', '--help');
      const exitCodePromise = kms(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'kms:rm-grant' },
      ]);
    });
  });

  it('removes a grant after confirmation', async () => {
    useUser();
    useIssuer('iss_test', {
      policies: [createProjectGrant({ projectId: 'prj_1' })],
    });
    useDeleteProjectGrant('iss_test', 'prj_1');
    client.setArgv('kms', 'rm-grant', 'iss_test', 'prj_1');
    const exitCodePromise = kms(client);
    await expect(client.stderr).toOutput('Remove');
    client.stdin.write('y\n');
    await expect(exitCodePromise).resolves.toEqual(0);
    await expect(client.stderr).toOutput('Removed');
  });

  it('skips the prompt with --yes and tracks the flag', async () => {
    useUser();
    useDeleteProjectGrant('iss_test', 'prj_1');
    client.setArgv('kms', 'rm-grant', 'iss_test', 'prj_1', '--yes');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:remove-grant', value: 'rm-grant' },
      { key: 'argument:issuerId', value: '[REDACTED]' },
      { key: 'argument:projectId', value: '[REDACTED]' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });

  it('reports a project that has no grant on the issuer', async () => {
    useUser();
    useIssuer('iss_test', { policies: [] });
    client.setArgv('kms', 'rm-grant', 'iss_test', 'prj_missing');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'No grant for project prj_missing on issuer iss_test.'
    );
  });

  it('explains a 403 as a permissions problem', async () => {
    useUser();
    useKmsError(
      {
        method: 'delete',
        path: '/v1/kms/issuers/iss_test/policies/project-grant/prj_1',
      },
      403,
      'forbidden',
      'Not authorized'
    );
    client.setArgv('kms', 'rm-grant', 'iss_test', 'prj_1', '--yes');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('requires the Owner role');
  });

  describe('non-interactive', () => {
    it('requires --yes', async () => {
      useUser();
      vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv('kms', 'rm-grant', 'iss_test', 'prj_1');
      await expect(kms(client)).rejects.toThrow('exit');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'confirmation_required',
      });
    });

    it('emits a success payload with --yes', async () => {
      useUser();
      useDeleteProjectGrant('iss_test', 'prj_1');
      client.nonInteractive = true;
      client.setArgv('kms', 'rm-grant', 'iss_test', 'prj_1', '--yes');
      const exitCode = await kms(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'ok',
        grant: { issuerId: 'iss_test', projectId: 'prj_1' },
      });
    });
  });
});
