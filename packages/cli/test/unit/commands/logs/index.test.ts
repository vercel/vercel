import { describe, it, expect, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { useDeployment } from '../../../mocks/deployment';
import logs from '../../../../src/commands/logs';
import { join } from 'path';

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit/commands/logs', name);

// API response format (what the server returns)
interface ApiLogEntry {
  requestId?: string;
  timestamp?: string;
  deploymentId?: string;
  requestMethod?: string;
  requestPath?: string;
  statusCode?: number;
  environment?: string;
  domain?: string;
  logs?: Array<{
    level?: string;
    message?: string;
    messageTruncated?: boolean;
  }>;
  events?: Array<{ source?: string }>;
}

function createMockLog(
  overrides: {
    id?: string;
    message?: string;
    level?: string;
    source?: string;
    environment?: string;
    deploymentId?: string;
    responseStatusCode?: number;
  } = {}
): ApiLogEntry {
  return {
    requestId: overrides.id ?? 'log_123',
    timestamp: new Date().toISOString(),
    deploymentId: overrides.deploymentId ?? 'dpl_test123',
    requestMethod: 'GET',
    requestPath: '/api/test',
    statusCode: overrides.responseStatusCode ?? 200,
    environment: overrides.environment ?? 'production',
    domain: 'test.vercel.app',
    logs: [
      {
        level: overrides.level ?? 'info',
        message: overrides.message ?? 'Test log message',
      },
    ],
    events: [{ source: overrides.source ?? 'serverless' }],
  };
}

function useRequestLogs(logs: ApiLogEntry[] = []) {
  client.scenario.get('/api/logs/request-logs', (_req, res) => {
    res.json({
      rows: logs,
      hasMoreRows: false,
    });
  });
}

describe('logs', () => {
  describe('--help', () => {
    it('should display help and track telemetry', async () => {
      client.setArgv('logs', '--help');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'logs',
        },
      ]);
    });

    it('should display help with examples', async () => {
      client.setArgv('logs', '--help');
      await logs(client);

      const output = client.getFullOutput();
      expect(output).toContain('Display request logs');
      expect(output).toContain('--level');
      expect(output).toContain('--environment');
    });
  });

  describe('with linked project', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_logstest',
        name: 'logs-test-project',
      });
    });

    it('should fetch logs for linked project', async () => {
      const mockLogs = [
        createMockLog({ message: 'First log' }),
        createMockLog({ message: 'Second log' }),
      ];
      useRequestLogs(mockLogs);

      client.cwd = fixture('linked-project');
      client.setArgv('logs');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Fetching logs');
    });

    it('should output logs as JSON with --json flag', async () => {
      const mockLogs = [createMockLog({ message: 'JSON log test' })];
      useRequestLogs(mockLogs);

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--json');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
      await expect(client.stdout).toOutput('"message":"JSON log test"');
    });

    it('should track telemetry for --json flag', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--json');
      await logs(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:json',
          value: 'TRUE',
        },
      ]);
    });

    it('should display "no logs found" when empty', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logs');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('No logs found');
    });
  });

  describe('--project option', () => {
    beforeEach(() => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'prj_explicit',
        name: 'explicit-project',
      });
    });

    it('should fetch logs for specified project', async () => {
      useRequestLogs([createMockLog()]);

      client.setArgv('logs', '--project', 'explicit-project');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
    });

    it('should track telemetry for --project option', async () => {
      useRequestLogs([]);

      client.setArgv('logs', '--project', 'explicit-project');
      await logs(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:project',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should error when project not found', async () => {
      client.scenario.get('/v9/projects/nonexistent', (_req, res) => {
        res.status(404).json({ error: { code: 'not_found' } });
      });

      client.setArgv('logs', '--project', 'nonexistent');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Project not found');
    });
  });

  describe('--level option', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_logstest',
        name: 'logs-test-project',
      });
    });

    it('should filter by error level', async () => {
      let receivedLevel: string | undefined;
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        receivedLevel = req.query.level as string;
        res.json({
          rows: [createMockLog({ level: 'error', message: 'Error occurred' })],
          hasMoreRows: false,
        });
      });

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--level', 'error');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
      expect(receivedLevel).toEqual('error');
    });

    it('should track telemetry for valid --level values', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--level', 'error');
      await logs(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:level',
          value: 'error',
        },
      ]);
    });

    it('should track telemetry for multiple --level values', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--level', 'error', '--level', 'warning');
      await logs(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:level',
          value: 'error,warning',
        },
      ]);
    });

    it('should error on invalid level', async () => {
      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--level', 'invalid');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid log level: invalid');
    });
  });

  describe('--environment option', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_logstest',
        name: 'logs-test-project',
      });
    });

    it('should filter by production environment', async () => {
      let receivedEnvironment: string | undefined;
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        receivedEnvironment = req.query.environment as string;
        res.json({
          rows: [createMockLog({ environment: 'production' })],
          hasMoreRows: false,
        });
      });

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--environment', 'production');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
      expect(receivedEnvironment).toEqual('production');
    });

    it('should track telemetry for production environment', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--environment', 'production');
      await logs(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:environment',
          value: 'production',
        },
      ]);
    });

    it('should track telemetry for preview environment', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--environment', 'preview');
      await logs(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:environment',
          value: 'preview',
        },
      ]);
    });

    it('should error on invalid environment', async () => {
      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--environment', 'staging');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid environment: staging');
    });
  });

  describe('--source option', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_logstest',
        name: 'logs-test-project',
      });
    });

    it('should filter by serverless source', async () => {
      let receivedSource: string | undefined;
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        receivedSource = req.query.source as string;
        res.json({
          rows: [createMockLog({ source: 'serverless' })],
          hasMoreRows: false,
        });
      });

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--source', 'serverless');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
      expect(receivedSource).toEqual('serverless');
    });

    it('should track telemetry for valid --source values', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--source', 'edge-function');
      await logs(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:source',
          value: 'edge-function',
        },
      ]);
    });

    it('should error on invalid source', async () => {
      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--source', 'invalid-source');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid source: invalid-source');
    });
  });

  describe('--status-code option', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_logstest',
        name: 'logs-test-project',
      });
    });

    it('should filter by status code', async () => {
      let receivedStatusCode: string | undefined;
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        receivedStatusCode = req.query.statusCode as string;
        res.json({
          rows: [createMockLog({ responseStatusCode: 500 })],
          hasMoreRows: false,
        });
      });

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--status-code', '500');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
      expect(receivedStatusCode).toEqual('500');
    });

    it('should track telemetry for --status-code option', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--status-code', '500');
      await logs(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:status-code',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--since and --until options', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_logstest',
        name: 'logs-test-project',
      });
    });

    it('should filter by time range', async () => {
      let receivedStartDate: string | undefined;
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        receivedStartDate = req.query.startDate as string;
        res.json({
          rows: [createMockLog()],
          hasMoreRows: false,
        });
      });

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--since', '1h');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
      const startDateMs = parseInt(receivedStartDate!, 10);
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      expect(startDateMs).toBeGreaterThan(oneHourAgo - 1000);
      expect(startDateMs).toBeLessThan(oneHourAgo + 1000);
    });

    it('should track telemetry for --since option', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--since', '1h');
      await logs(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:since',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should track telemetry for --until option', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--until', '30m');
      await logs(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:until',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--limit option', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_logstest',
        name: 'logs-test-project',
      });
    });

    it('should limit number of results', async () => {
      useRequestLogs([createMockLog(), createMockLog()]);

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--limit', '10');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
    });

    it('should track telemetry for --limit option', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--limit', '50');
      await logs(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:limit',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--query option', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_logstest',
        name: 'logs-test-project',
      });
    });

    it('should search logs', async () => {
      let receivedSearch: string | undefined;
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        receivedSearch = req.query.search as string;
        res.json({
          rows: [createMockLog({ message: 'timeout error occurred' })],
          hasMoreRows: false,
        });
      });

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--query', 'timeout');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
      expect(receivedSearch).toEqual('timeout');
    });

    it('should track telemetry for --query option', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--query', 'error');
      await logs(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:query',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--deployment option', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_logstest',
        name: 'logs-test-project',
      });
    });

    it('should filter by deployment ID with --no-follow', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });

      let receivedDeploymentId: string | undefined;
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        receivedDeploymentId = req.query.deploymentId as string;
        res.json({
          rows: [createMockLog({ deploymentId: deployment.id })],
          hasMoreRows: false,
        });
      });

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--deployment', deployment.id, '--no-follow');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
      expect(receivedDeploymentId).toEqual(deployment.id);
    });

    it('should track telemetry for --deployment option', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });

      client.scenario.get(
        `/v1/projects/prj_logstest/deployments/${deployment.id}/runtime-logs`,
        (_req, res) => {
          res.status(200);
          res.end();
        }
      );

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--deployment', deployment.id);
      await logs(client);

      // Implicit --follow is enabled when deployment is specified
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:deployment',
          value: '[REDACTED]',
        },
        {
          key: 'flag:follow',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('positional deployment argument (implicit --follow)', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_logstest',
        name: 'logs-test-project',
      });
    });

    it('should enable --follow implicitly when deployment ID is specified', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });

      client.scenario.get(
        `/v1/projects/prj_logstest/deployments/${deployment.id}/runtime-logs`,
        (_req, res) => {
          res.status(200);
          res.end();
        }
      );

      client.cwd = fixture('linked-project');
      client.setArgv('logs', deployment.id);
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
    });

    it('should allow --no-follow to disable implicit follow', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });

      let receivedDeploymentId: string | undefined;
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        receivedDeploymentId = req.query.deploymentId as string;
        res.json({
          rows: [createMockLog({ deploymentId: deployment.id })],
          hasMoreRows: false,
        });
      });

      client.cwd = fixture('linked-project');
      client.setArgv('logs', deployment.id, '--no-follow');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
      expect(receivedDeploymentId).toEqual(deployment.id);
    });

    it('should extract hostname from URL positional argument', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });

      client.scenario.get(`/v13/deployments/${deployment.url}`, (_req, res) => {
        res.json(deployment);
      });

      client.scenario.get(
        `/v1/projects/prj_logstest/deployments/${deployment.id}/runtime-logs`,
        (_req, res) => {
          res.status(200);
          res.end();
        }
      );

      client.cwd = fixture('linked-project');
      client.setArgv('logs', `https://${deployment.url}/some/path`);
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
    });

    it('should prioritize positional argument over --deployment flag', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });

      client.scenario.get(
        `/v1/projects/prj_logstest/deployments/${deployment.id}/runtime-logs`,
        (_req, res) => {
          res.status(200);
          res.end();
        }
      );

      client.cwd = fixture('linked-project');
      client.setArgv('logs', deployment.id, '--deployment', 'other_dpl_id');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
    });
  });

  describe('--request-id option', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_logstest',
        name: 'logs-test-project',
      });
    });

    it('should filter by request ID', async () => {
      let receivedRequestId: string | undefined;
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        receivedRequestId = req.query.requestId as string;
        res.json({
          rows: [createMockLog({ id: 'req_specific123' })],
          hasMoreRows: false,
        });
      });

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--request-id', 'req_specific123');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(0);
      expect(receivedRequestId).toEqual('req_specific123');
    });

    it('should track telemetry for --request-id option', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--request-id', 'req_abc123');
      await logs(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:request-id',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('error handling', () => {
    it('should error when not linked and no project specified', async () => {
      useUser();

      client.setArgv('logs');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput("isn't linked to a project");
    });
  });

  describe('--follow option', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_logstest',
        name: 'logs-test-project',
      });
    });

    it('should error when --follow is used with --no-branch and no deployment', async () => {
      client.cwd = fixture('linked-project');
      client.setArgv('logs', '--follow', '--no-branch');
      const exitCode = await logs(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        '--follow flag requires a deployment'
      );
    });

    it('should error when --follow is used with --level', async () => {
      client.cwd = fixture('linked-project');
      client.setArgv(
        'logs',
        '--follow',
        '--deployment',
        'dpl_test',
        '--level',
        'error'
      );
      const exitCode = await logs(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Remove: --level');
    });

    it('should error when --follow is used with --environment', async () => {
      client.cwd = fixture('linked-project');
      client.setArgv(
        'logs',
        '--follow',
        '--deployment',
        'dpl_test',
        '--environment',
        'production'
      );
      const exitCode = await logs(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Remove: --environment');
    });

    it('should error when --follow is used with --query', async () => {
      client.cwd = fixture('linked-project');
      client.setArgv(
        'logs',
        '--follow',
        '--deployment',
        'dpl_test',
        '--query',
        'error'
      );
      const exitCode = await logs(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Remove: --query');
    });

    it('should error when --follow is used with multiple incompatible flags', async () => {
      client.cwd = fixture('linked-project');
      client.setArgv(
        'logs',
        '--follow',
        '--deployment',
        'dpl_test',
        '--level',
        'error',
        '--since',
        '1h'
      );
      const exitCode = await logs(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Remove: --level, --since');
    });

    it('should track telemetry for --follow flag', async () => {
      client.cwd = fixture('linked-project');
      // Use --no-branch to avoid branch detection and deployment lookup
      client.setArgv('logs', '--follow', '--no-branch');
      await logs(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:follow',
          value: 'TRUE',
        },
      ]);
    });
  });
});
