import { beforeEach, describe, expect, it, vi } from 'vitest';

import share from '../../../../src/commands/share';
import { client } from '../../../mocks/client';
import { useDeployment } from '../../../mocks/deployment';
import { useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import {
  setupTmpDir,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import * as createGitMetaModule from '../../../../src/util/create-git-meta';

describe('share', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    client.reset();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('share', '--help');
      const exitCode = await share(client);

      expect(exitCode).toBe(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'share',
        },
      ]);
    });

    it('prints help output', async () => {
      client.setArgv('share', '--help');
      const exitCode = await share(client);

      expect(exitCode).toBe(2);
      expect(client.getFullOutput()).toContain(
        'Create a shareable link for a protected deployment'
      );
    });
  });

  it('creates a share URL from an explicit deployment URL', async () => {
    client.cwd = setupTmpDir();
    const user = useUser();
    const deployment = useDeployment({ creator: user });

    client.scenario.patch('/v1/aliases/:id/protection-bypass', (req, res) => {
      expect(req.params.id).toBe(deployment.id);
      res.json({
        protectionBypass: {
          share_token: {},
        },
      });
    });

    client.setArgv('share', `https://${deployment.url}`);
    const exitCode = await share(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toBe(
      `https://${deployment.url}/?_vercel_share=share_token\n`
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'argument:deploymentIdOrHost',
        value: '[REDACTED]',
      },
    ]);
  });

  it('creates a share URL from a deployment ID and normalizes --ttl', async () => {
    client.cwd = setupTmpDir();
    const user = useUser();
    useTeams('team_dummy');
    client.config.currentTeam = 'team_dummy';
    const deployment = useDeployment({ creator: user });

    client.scenario.patch('/v1/aliases/:id/protection-bypass', (req, res) => {
      expect(req.params.id).toBe(deployment.id);
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.body).toEqual({ ttl: 3600 });
      res.json({
        protectionBypass: {
          ttl_token: {},
        },
      });
    });

    client.setArgv('share', deployment.id, '--ttl', '1h');
    const exitCode = await share(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toBe(
      `https://${deployment.url}/?_vercel_share=ttl_token\n`
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'argument:deploymentIdOrHost',
        value: '[REDACTED]',
      },
      {
        key: 'option:ttl',
        value: '[REDACTED]',
      },
    ]);
  });

  it('uses the current branch deployment when no argument is provided', async () => {
    client.cwd = setupUnitFixture('commands/deploy/static');
    const user = useUser();
    useTeams('team_dummy');
    const project = {
      id: 'static',
      name: 'static-project',
    };
    useProject(project);
    const deployment = useDeployment({
      creator: user,
      project,
      meta: {
        githubCommitRef: 'feature-share',
      },
    });

    vi.spyOn(createGitMetaModule, 'createGitMeta').mockResolvedValue({
      commitRef: 'feature-share',
    });

    client.scenario.patch('/v1/aliases/:id/protection-bypass', (req, res) => {
      expect(req.params.id).toBe(deployment.id);
      expect(req.query.teamId).toBe('team_dummy');
      res.json({
        protectionBypass: {
          branch_token: {},
        },
      });
    });

    client.setArgv('share');
    const exitCode = await share(client);

    expect(exitCode).toBe(0);
    expect(client.stdout.getFullOutput()).toBe(
      `https://${deployment.url}/?_vercel_share=branch_token\n`
    );
  });

  it('errors when no linked project exists for the branch-based default', async () => {
    client.cwd = setupTmpDir();
    useUser();

    client.setArgv('share');
    const exitCode = await share(client);

    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput(
      'No linked project found. Run `vercel link` or pass a deployment URL or ID.'
    );
  });

  it('returns failed deployment context when the branch has no ready deployment', async () => {
    client.cwd = setupUnitFixture('commands/deploy/static');
    const user = useUser();
    useTeams('team_dummy');
    const project = {
      id: 'static',
      name: 'static-project',
    };
    useProject(project);
    const deployment = useDeployment({
      creator: user,
      project,
      state: 'ERROR',
      meta: {
        githubCommitRef: 'feature-broken',
      },
    });

    vi.spyOn(createGitMetaModule, 'createGitMeta').mockResolvedValue({
      commitRef: 'feature-broken',
    });

    client.setArgv('share');
    const exitCode = await share(client);

    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput(
      `Latest deployment for branch "feature-broken" is not ready: https://${deployment.url} (ERROR).`
    );
  });

  it('errors when --ttl is invalid', async () => {
    client.setArgv('share', 'dpl_123', '--ttl', '500ms');
    const exitCode = await share(client);

    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('Invalid TTL');
  });
});
