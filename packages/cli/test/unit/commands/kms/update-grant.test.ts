import { describe, expect, it } from 'vitest';
import kms from '../../../../src/commands/kms';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useKmsError, useUpdateProjectGrant } from '../../../mocks/kms';

describe('kms update-grant', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('kms', 'update-grant', '--help');
      const exitCodePromise = kms(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'kms:update-grant' },
      ]);
    });
  });

  it('narrows a grant to one environment', async () => {
    useUser();
    useUpdateProjectGrant('iss_test', 'prj_1');
    client.setArgv(
      'kms',
      'update-grant',
      'iss_test',
      'prj_1',
      '--environment',
      'production'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Updated');
    expect(stderr).toContain('production');
  });

  it('retargets a grant to a custom environment by ID', async () => {
    useUser();
    useUpdateProjectGrant('iss_test', 'prj_1');
    client.setArgv(
      'kms',
      'update-grant',
      'iss_test',
      'prj_1',
      '--environment',
      'env_1a2b3c4d'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('env_1a2b3c4d');
  });

  it('rejects an environment that is neither a system environment nor a custom environment ID', async () => {
    useUser();
    client.setArgv(
      'kms',
      'update-grant',
      'iss_test',
      'prj_1',
      '--environment',
      'staging'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid environment: staging');
  });

  it('clears token claims with --remove-token-claims', async () => {
    useUser();
    useUpdateProjectGrant('iss_test', 'prj_1');
    client.setArgv(
      'kms',
      'update-grant',
      'iss_test',
      'prj_1',
      '--remove-token-claims'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:update-grant', value: 'update-grant' },
      { key: 'argument:issuerId', value: '[REDACTED]' },
      { key: 'argument:projectId', value: '[REDACTED]' },
      { key: 'flag:remove-token-claims', value: 'TRUE' },
    ]);
  });

  it('rejects conflicting token-claims flags', async () => {
    useUser();
    client.setArgv(
      'kms',
      'update-grant',
      'iss_test',
      'prj_1',
      '--token-claims',
      '{}',
      '--remove-token-claims'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      '--token-claims and --remove-token-claims conflict'
    );
  });

  it('requires at least one change', async () => {
    useUser();
    client.setArgv('kms', 'update-grant', 'iss_test', 'prj_1');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Nothing to update');
  });

  it('reports a grant that does not exist', async () => {
    useUser();
    useKmsError(
      {
        method: 'patch',
        path: '/v1/kms/issuers/iss_test/policies/project-grant/prj_missing',
      },
      404,
      'not_found',
      'Policy not found'
    );
    client.setArgv(
      'kms',
      'update-grant',
      'iss_test',
      'prj_missing',
      '--environment',
      'production'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      "Couldn't find a grant for project prj_missing"
    );
  });
});
