import { afterEach, describe, expect, it, vi } from 'vitest';
import kms from '../../../../src/commands/kms';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useCreateProjectGrant, useKmsError } from '../../../mocks/kms';

describe('kms add-grant', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('kms', 'add-grant', '--help');
      const exitCodePromise = kms(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'kms:add-grant' },
      ]);
    });
  });

  it('grants a project access in the given environments', async () => {
    useUser();
    useCreateProjectGrant('iss_test');
    client.setArgv(
      'kms',
      'add-grant',
      'iss_test',
      '--project',
      'prj_1',
      '--environment',
      'production',
      '--environment',
      'preview'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('prj_1');
    expect(stderr).toContain('production, preview');
  });

  it('tracks the environment count without the claim contents', async () => {
    useUser();
    useCreateProjectGrant('iss_test');
    client.setArgv(
      'kms',
      'add-grant',
      'iss_test',
      '--project',
      'prj_1',
      '--environment',
      'production',
      '--token-claims',
      '{"role":"admin"}'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:add-grant', value: 'add-grant' },
      { key: 'argument:issuerId', value: '[REDACTED]' },
      { key: 'option:project', value: '[REDACTED]' },
      { key: 'option:environment', value: '1' },
      { key: 'option:token-claims', value: '[REDACTED]' },
    ]);
  });

  it('requires a project', async () => {
    useUser();
    client.setArgv(
      'kms',
      'add-grant',
      'iss_test',
      '--environment',
      'production'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('A project is required');
  });

  it('requires at least one environment', async () => {
    useUser();
    client.setArgv('kms', 'add-grant', 'iss_test', '--project', 'prj_1');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'At least one environment is required'
    );
  });

  it('rejects malformed --token-claims JSON', async () => {
    useUser();
    client.setArgv(
      'kms',
      'add-grant',
      'iss_test',
      '--project',
      'prj_1',
      '--environment',
      'production',
      '--token-claims',
      '[]'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      '--token-claims must be a JSON object'
    );
  });

  describe('--format json', () => {
    it('writes the grant to stdout', async () => {
      useUser();
      useCreateProjectGrant('iss_test');
      client.setArgv(
        'kms',
        'add-grant',
        'iss_test',
        '--project',
        'prj_1',
        '--environment',
        'production',
        '--format',
        'json'
      );
      const exitCode = await kms(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        kind: 'project-grant',
        projectId: 'prj_1',
        environments: ['production'],
      });
    });
  });

  describe('non-interactive', () => {
    it('emits an agent payload when --project is missing', async () => {
      vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv(
        'kms',
        'add-grant',
        'iss_test',
        '--environment',
        'production'
      );
      await expect(kms(client)).rejects.toThrow('exit');

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_project',
      });
    });
  });

  it('explains a 403 as a permissions problem', async () => {
    useUser();
    useKmsError(
      { method: 'post', path: '/v1/kms/issuers/iss_test/policies' },
      403,
      'forbidden',
      'Not authorized'
    );
    client.setArgv(
      'kms',
      'add-grant',
      'iss_test',
      '--project',
      'prj_1',
      '--environment',
      'production'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('requires the Owner role');
  });
});
