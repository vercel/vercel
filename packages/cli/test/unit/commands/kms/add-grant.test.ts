import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import kms from '../../../../src/commands/kms';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useCreateProjectGrant, useKmsError } from '../../../mocks/kms';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { getLinkedProject } from '../../../../src/util/projects/link';

vi.mock('../../../../src/util/projects/link');
const mockedGetLinkedProject = vi.mocked(getLinkedProject);

/** Register the project `--project` resolves to (by name or ID). */
function useGrantProject(overrides: { id: string; name: string }) {
  useProject({ ...defaultProject, ...overrides });
}

describe('kms add-grant', () => {
  beforeEach(() => {
    // Default to "not linked" so tests that omit --project exercise the
    // missing-project path; individual tests override this when needed.
    mockedGetLinkedProject.mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    } as Awaited<ReturnType<typeof getLinkedProject>>);
  });

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
    useGrantProject({ id: 'prj_1', name: 'prj_1' });
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
    useGrantProject({ id: 'prj_1', name: 'prj_1' });
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

  it('grants a project access in a custom environment by ID', async () => {
    useUser();
    useGrantProject({ id: 'prj_1', name: 'prj_1' });
    useCreateProjectGrant('iss_test');
    client.setArgv(
      'kms',
      'add-grant',
      'iss_test',
      '--project',
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
    useGrantProject({ id: 'prj_1', name: 'prj_1' });
    client.setArgv(
      'kms',
      'add-grant',
      'iss_test',
      '--project',
      'prj_1',
      '--environment',
      'staging'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid environment: staging');
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

  it('resolves --project by name to its ID', async () => {
    useUser();
    useGrantProject({ id: 'prj_1', name: 'my-app' });
    useCreateProjectGrant('iss_test');
    client.setArgv(
      'kms',
      'add-grant',
      'iss_test',
      '--project',
      'my-app',
      '--environment',
      'production'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    // The grant is created against the resolved project ID, not the name.
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('prj_1');
  });

  it('defaults to the linked project when --project is omitted', async () => {
    useUser();
    mockedGetLinkedProject.mockResolvedValue({
      status: 'linked',
      project: {
        id: 'prj_linked',
        name: 'linked-app',
        accountId: 'team_dummy',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      org: { id: 'team_dummy', slug: 'my-team', type: 'team' },
    } as Awaited<ReturnType<typeof getLinkedProject>>);
    useCreateProjectGrant('iss_test');
    client.setArgv(
      'kms',
      'add-grant',
      'iss_test',
      '--environment',
      'production'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('prj_linked');
  });

  it('reports an unknown --project', async () => {
    useUser();
    useUnknownProject();
    client.setArgv(
      'kms',
      'add-grant',
      'iss_test',
      '--project',
      'ghost',
      '--environment',
      'production'
    );
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('was not found');
  });

  it('requires at least one environment', async () => {
    useUser();
    useGrantProject({ id: 'prj_1', name: 'prj_1' });
    client.setArgv('kms', 'add-grant', 'iss_test', '--project', 'prj_1');
    const exitCode = await kms(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'At least one environment is required'
    );
  });

  it('rejects malformed --token-claims JSON', async () => {
    useUser();
    useGrantProject({ id: 'prj_1', name: 'prj_1' });
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
      useGrantProject({ id: 'prj_1', name: 'prj_1' });
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
    useGrantProject({ id: 'prj_1', name: 'prj_1' });
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
