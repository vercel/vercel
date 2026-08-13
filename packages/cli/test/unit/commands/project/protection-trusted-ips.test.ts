import { afterEach, describe, expect, it, vi } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';

function setupProject(trustedIps?: unknown) {
  useUser();
  useTeams('team_dummy');
  useProject({
    ...defaultProject,
    id: 'prj_123',
    name: 'my-project',
    ...(trustedIps !== undefined ? { trustedIps } : {}),
  } as never);
}

describe('project protection trusted-ips', () => {
  afterEach(() => {
    client.stdin.isTTY = true;
    client.nonInteractive = false;
    vi.restoreAllMocks();
  });

  describe('get', () => {
    it('reports when Trusted IPs are not configured', async () => {
      setupProject(null);
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'get',
        'my-project'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput('Trusted IPs are not configured');
    });

    it('shows the allowlist as JSON', async () => {
      setupProject({
        deploymentType: 'all',
        addresses: [{ value: '203.0.113.4', note: 'office' }],
        protectionMode: 'additional',
      });
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'get',
        'my-project',
        '--json'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      const out = JSON.parse(client.stdout.getFullOutput().trim());
      expect(out).toMatchObject({
        projectId: 'prj_123',
        name: 'my-project',
        trustedIps: {
          deploymentType: 'all',
          protectionMode: 'additional',
          addresses: [{ value: '203.0.113.4', note: 'office' }],
        },
      });
    });

    it('shows scope, mode, and addresses in human output', async () => {
      setupProject({
        deploymentType: 'production',
        addresses: [{ value: '198.51.100.0/24' }],
        protectionMode: 'exclusive',
      });
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'get',
        'my-project'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput('scope: production');
      await expect(client.stderr).toOutput('mode: exclusive');
      await expect(client.stderr).toOutput('198.51.100.0/24');
    });

    it('tracks the action argument verbatim in telemetry', async () => {
      setupProject(null);
      client.setArgv(
        'project',
        'protection',
        'trusted-ips',
        'get',
        'my-project'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:protection',
          value: 'protection trusted-ips',
        },
        {
          key: 'argument:action',
          value: 'get',
        },
      ]);
    });
  });

  it('rejects an unknown action', async () => {
    setupProject(null);
    client.setArgv('project', 'protection', 'trusted-ips', 'frobnicate');
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('Invalid action');
  });

  describe('--help', () => {
    it('prints help and tracks telemetry', async () => {
      client.setArgv('project', 'protection', 'trusted-ips', '--help');
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'project:protection trusted-ips',
        },
      ]);
    });
  });
});
