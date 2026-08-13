import { describe, it, expect } from 'vitest';
import projects from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';

const DOMAIN = 'example.com';

function domainPath(projectId: string) {
  return `/v9/projects/${projectId}/domains/${DOMAIN}`;
}

describe('project domains update', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('project', 'domains', '--help');
      const exitCodePromise = projects(client);
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'project:domains',
        },
      ]);
    });
  });

  it('errors when no setting flag is provided', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({ ...defaultProject, name: 'test_project' });

    client.setArgv('project', 'domains', 'update', DOMAIN, 'test_project');
    const exitCode = await projects(client);
    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput('at least one setting option');
  });

  it('errors on invalid --redirect-status', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({ ...defaultProject, name: 'test_project' });

    client.setArgv(
      'project',
      'domains',
      'update',
      DOMAIN,
      'test_project',
      '--redirect',
      'target.com',
      '--redirect-status',
      '418'
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput('Invalid --redirect-status');
  });

  it('errors when the domain is not found on the project', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({ ...defaultProject, name: 'test_project' });

    client.scenario.get(domainPath(project.id!), (_req, res) => {
      res.status(404).json({
        error: { code: 'not_found', message: 'Not found' },
      });
    });

    client.setArgv(
      'project',
      'domains',
      'update',
      DOMAIN,
      'test_project',
      '--git-branch',
      'feat/login'
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('was not found on project');
  });

  it('sends a merged PATCH when setting a single field and tracks telemetry', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({ ...defaultProject, name: 'test_project' });

    client.scenario.get(domainPath(project.id!), (_req, res) => {
      res.json({
        name: DOMAIN,
        projectId: project.id,
        gitBranch: 'old-branch',
        redirect: null,
        redirectStatusCode: null,
        customEnvironmentId: 'env_existing',
      });
    });

    let receivedBody: Record<string, unknown> | undefined;
    client.scenario.patch(domainPath(project.id!), (req, res) => {
      receivedBody = req.body;
      res.json({
        name: DOMAIN,
        projectId: project.id,
        gitBranch: 'new-branch',
        redirect: null,
        redirectStatusCode: null,
        customEnvironmentId: 'env_existing',
      });
    });

    client.setArgv(
      'project',
      'domains',
      'update',
      DOMAIN,
      'test_project',
      '--git-branch',
      'new-branch'
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);

    // Only git branch changes; untouched fields are preserved (customEnvironmentId
    // is re-sent as a string, redirect/status stay null).
    expect(receivedBody).toEqual({
      gitBranch: 'new-branch',
      redirect: null,
      redirectStatusCode: null,
      customEnvironmentId: 'env_existing',
    });

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:domains', value: 'domains update' },
      { key: 'argument:domain', value: '[REDACTED]' },
      { key: 'option:git-branch', value: '[REDACTED]' },
    ]);
  });

  it('sets a redirect with a status code (combined flags)', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({ ...defaultProject, name: 'test_project' });

    client.scenario.get(domainPath(project.id!), (_req, res) => {
      res.json({
        name: DOMAIN,
        projectId: project.id,
        gitBranch: null,
        redirect: null,
        redirectStatusCode: null,
      });
    });

    let receivedBody: Record<string, unknown> | undefined;
    client.scenario.patch(domainPath(project.id!), (req, res) => {
      receivedBody = req.body;
      res.json({
        name: DOMAIN,
        projectId: project.id,
        gitBranch: null,
        redirect: 'target.com',
        redirectStatusCode: 308,
      });
    });

    client.setArgv(
      'project',
      'domains',
      'update',
      DOMAIN,
      'test_project',
      '--redirect',
      'target.com',
      '--redirect-status',
      '308'
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    expect(receivedBody).toEqual({
      gitBranch: null,
      redirect: 'target.com',
      redirectStatusCode: 308,
    });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:domains', value: 'domains update' },
      { key: 'argument:domain', value: '[REDACTED]' },
      { key: 'option:redirect', value: '[REDACTED]' },
      { key: 'option:redirect-status', value: '308' },
    ]);
  });

  it('resolves --environment slug to a custom environment id', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
      customEnvironments: [
        {
          id: 'env_123',
          slug: 'staging',
          type: 'preview',
          createdAt: 0,
          updatedAt: 0,
          description: '',
          domains: [],
        },
      ],
    });

    client.scenario.get(domainPath(project.id!), (_req, res) => {
      res.json({
        name: DOMAIN,
        projectId: project.id,
        gitBranch: null,
        redirect: null,
        redirectStatusCode: null,
      });
    });

    let receivedBody: Record<string, unknown> | undefined;
    client.scenario.patch(domainPath(project.id!), (req, res) => {
      receivedBody = req.body;
      res.json({
        name: DOMAIN,
        projectId: project.id,
        customEnvironmentId: 'env_123',
      });
    });

    client.setArgv(
      'project',
      'domains',
      'update',
      DOMAIN,
      'test_project',
      '--environment',
      'staging'
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    expect(receivedBody).toEqual({
      gitBranch: null,
      redirect: null,
      redirectStatusCode: null,
      customEnvironmentId: 'env_123',
    });
  });

  it('errors when the custom environment is not found', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
      customEnvironments: [],
    });

    client.scenario.get(domainPath(project.id!), (_req, res) => {
      res.json({ name: DOMAIN, projectId: project.id });
    });

    client.setArgv(
      'project',
      'domains',
      'update',
      DOMAIN,
      'test_project',
      '--environment',
      'nope'
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('was not found on project');
  });

  it('preserves an existing git branch on an --environment-only update', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
      customEnvironments: [
        {
          id: 'env_123',
          slug: 'staging',
          type: 'preview',
          createdAt: 0,
          updatedAt: 0,
          description: '',
          domains: [],
        },
      ],
    });

    client.scenario.get(domainPath(project.id!), (_req, res) => {
      res.json({
        name: DOMAIN,
        projectId: project.id,
        gitBranch: 'feat/existing',
        redirect: null,
        redirectStatusCode: null,
      });
    });

    let receivedBody: Record<string, unknown> | undefined;
    client.scenario.patch(domainPath(project.id!), (req, res) => {
      receivedBody = req.body;
      res.json({
        name: DOMAIN,
        projectId: project.id,
        gitBranch: 'feat/existing',
        customEnvironmentId: 'env_123',
      });
    });

    client.setArgv(
      'project',
      'domains',
      'update',
      DOMAIN,
      'test_project',
      '--environment',
      'staging'
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    expect(receivedBody).toEqual({
      gitBranch: 'feat/existing',
      redirect: null,
      redirectStatusCode: null,
      customEnvironmentId: 'env_123',
    });
  });

  it('clears the git branch and custom environment with empty strings', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({ ...defaultProject, name: 'test_project' });

    client.scenario.get(domainPath(project.id!), (_req, res) => {
      res.json({
        name: DOMAIN,
        projectId: project.id,
        gitBranch: 'feat/existing',
        redirect: null,
        redirectStatusCode: null,
        customEnvironmentId: 'env_existing',
      });
    });

    let receivedBody: Record<string, unknown> | undefined;
    client.scenario.patch(domainPath(project.id!), (req, res) => {
      receivedBody = req.body;
      res.json({ name: DOMAIN, projectId: project.id });
    });

    client.setArgv(
      'project',
      'domains',
      'update',
      DOMAIN,
      'test_project',
      '--git-branch',
      '',
      '--environment',
      ''
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    // customEnvironmentId is omitted to clear it (the endpoint treats absence
    // as null); gitBranch is cleared explicitly.
    expect(receivedBody).toEqual({
      gitBranch: null,
      redirect: null,
      redirectStatusCode: null,
    });
  });

  it('clears a redirect with an empty string', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({ ...defaultProject, name: 'test_project' });

    client.scenario.get(domainPath(project.id!), (_req, res) => {
      res.json({
        name: DOMAIN,
        projectId: project.id,
        gitBranch: null,
        redirect: 'target.com',
        redirectStatusCode: 308,
      });
    });

    let receivedBody: Record<string, unknown> | undefined;
    client.scenario.patch(domainPath(project.id!), (req, res) => {
      receivedBody = req.body;
      res.json({ name: DOMAIN, projectId: project.id, redirect: null });
    });

    client.setArgv(
      'project',
      'domains',
      'update',
      DOMAIN,
      'test_project',
      '--redirect',
      ''
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    // Clearing the redirect must also clear the status code, not re-send the
    // stale prior code.
    expect(receivedBody).toEqual({
      gitBranch: null,
      redirect: null,
      redirectStatusCode: null,
    });
  });

  it('rejects setting both a git branch and a redirect before any remote call', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({ ...defaultProject, name: 'test_project' });

    client.setArgv(
      'project',
      'domains',
      'update',
      DOMAIN,
      'test_project',
      '--git-branch',
      'feat/x',
      '--redirect',
      'target.com'
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput(
      'Cannot set both a git branch and a redirect'
    );
  });

  it('rejects a merge-derived git branch and redirect conflict with a remedy', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({ ...defaultProject, name: 'test_project' });

    // The domain already has a git branch; setting only a redirect conflicts
    // after merging with the current config.
    client.scenario.get(domainPath(project.id!), (_req, res) => {
      res.json({
        name: DOMAIN,
        projectId: project.id,
        gitBranch: 'feat/existing',
        redirect: null,
        redirectStatusCode: null,
      });
    });

    client.setArgv(
      'project',
      'domains',
      'update',
      DOMAIN,
      'test_project',
      '--redirect',
      'target.com'
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Clear the other setting with --git-branch "" or --redirect ""'
    );
  });

  it('outputs JSON with --json', async () => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({ ...defaultProject, name: 'test_project' });

    client.scenario.get(domainPath(project.id!), (_req, res) => {
      res.json({
        name: DOMAIN,
        projectId: project.id,
        gitBranch: null,
        redirect: null,
        redirectStatusCode: null,
      });
    });
    client.scenario.patch(domainPath(project.id!), (_req, res) => {
      res.json({
        name: DOMAIN,
        projectId: project.id,
        gitBranch: 'feat/login',
        redirect: null,
        redirectStatusCode: null,
      });
    });

    client.setArgv(
      'project',
      'domains',
      'update',
      DOMAIN,
      'test_project',
      '--git-branch',
      'feat/login',
      '--json'
    );
    const exitCode = await projects(client);
    expect(exitCode).toEqual(0);
    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload).toMatchObject({
      updated: true,
      projectName: 'test_project',
      domain: DOMAIN,
      gitBranch: 'feat/login',
    });
  });
});
