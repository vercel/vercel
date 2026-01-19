import { describe, it, expect, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import logsv2 from '../../../../src/commands/logsv2';
import { join } from 'path';
import type { RequestLogEntry } from '../../../../src/util/logs-v2';

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit/commands/logsv2', name);

function createMockLog(
  overrides: Partial<RequestLogEntry> = {}
): RequestLogEntry {
  return {
    id: 'log_123',
    timestamp: Date.now(),
    deploymentId: 'dpl_test123',
    projectId: 'prj_logsv2test',
    level: 'info',
    message: 'Test log message',
    source: 'serverless',
    domain: 'test.vercel.app',
    requestMethod: 'GET',
    requestPath: '/api/test',
    responseStatusCode: 200,
    environment: 'production',
    ...overrides,
  };
}

function useRequestLogs(logs: RequestLogEntry[] = []) {
  client.scenario.get('/api/logs/request-logs', (_req, res) => {
    res.json({
      rows: logs,
      hasMoreRows: false,
    });
  });
}

describe('logsv2', () => {
  describe('--help', () => {
    it('should display help and track telemetry', async () => {
      client.setArgv('logsv2', '--help');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(2);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'logsv2',
        },
      ]);
    });

    it('should display help with examples', async () => {
      client.setArgv('logsv2', '--help');
      await logsv2(client);

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
        id: 'prj_logsv2test',
        name: 'logsv2-test-project',
      });
    });

    it('should fetch logs for linked project', async () => {
      const mockLogs = [
        createMockLog({ message: 'First log' }),
        createMockLog({ message: 'Second log' }),
      ];
      useRequestLogs(mockLogs);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Fetching logs');
    });

    it('should output logs as JSON with --json flag', async () => {
      const mockLogs = [createMockLog({ message: 'JSON log test' })];
      useRequestLogs(mockLogs);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--json');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
      await expect(client.stdout).toOutput('"message":"JSON log test"');
    });

    it('should track telemetry for --json flag', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--json');
      await logsv2(client);

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
      client.setArgv('logsv2');
      const exitCode = await logsv2(client);

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

      client.setArgv('logsv2', '--project', 'explicit-project');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
    });

    it('should track telemetry for --project option', async () => {
      useRequestLogs([]);

      client.setArgv('logsv2', '--project', 'explicit-project');
      await logsv2(client);

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

      client.setArgv('logsv2', '--project', 'nonexistent');
      const exitCode = await logsv2(client);

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
        id: 'prj_logsv2test',
        name: 'logsv2-test-project',
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
      client.setArgv('logsv2', '--level', 'error');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
      expect(receivedLevel).toEqual('error');
    });

    it('should track telemetry for valid --level values', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--level', 'error');
      await logsv2(client);

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
      client.setArgv('logsv2', '--level', 'error', '--level', 'warning');
      await logsv2(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:level',
          value: 'error,warning',
        },
      ]);
    });

    it('should error on invalid level', async () => {
      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--level', 'invalid');
      const exitCode = await logsv2(client);

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
        id: 'prj_logsv2test',
        name: 'logsv2-test-project',
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
      client.setArgv('logsv2', '--environment', 'production');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
      expect(receivedEnvironment).toEqual('production');
    });

    it('should track telemetry for production environment', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--environment', 'production');
      await logsv2(client);

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
      client.setArgv('logsv2', '--environment', 'preview');
      await logsv2(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:environment',
          value: 'preview',
        },
      ]);
    });

    it('should error on invalid environment', async () => {
      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--environment', 'staging');
      const exitCode = await logsv2(client);

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
        id: 'prj_logsv2test',
        name: 'logsv2-test-project',
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
      client.setArgv('logsv2', '--source', 'serverless');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
      expect(receivedSource).toEqual('serverless');
    });

    it('should track telemetry for valid --source values', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--source', 'edge-function');
      await logsv2(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:source',
          value: 'edge-function',
        },
      ]);
    });

    it('should error on invalid source', async () => {
      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--source', 'invalid-source');
      const exitCode = await logsv2(client);

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
        id: 'prj_logsv2test',
        name: 'logsv2-test-project',
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
      client.setArgv('logsv2', '--status-code', '500');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
      expect(receivedStatusCode).toEqual('500');
    });

    it('should track telemetry for --status-code option', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--status-code', '500');
      await logsv2(client);

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
        id: 'prj_logsv2test',
        name: 'logsv2-test-project',
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
      client.setArgv('logsv2', '--since', '1h');
      const exitCode = await logsv2(client);

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
      client.setArgv('logsv2', '--since', '1h');
      await logsv2(client);

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
      client.setArgv('logsv2', '--until', '30m');
      await logsv2(client);

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
        id: 'prj_logsv2test',
        name: 'logsv2-test-project',
      });
    });

    it('should limit number of results', async () => {
      useRequestLogs([createMockLog(), createMockLog()]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--limit', '10');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
    });

    it('should track telemetry for --limit option', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--limit', '50');
      await logsv2(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:limit',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--search option', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_logsv2test',
        name: 'logsv2-test-project',
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
      client.setArgv('logsv2', '--search', 'timeout');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
      expect(receivedSearch).toEqual('timeout');
    });

    it('should track telemetry for --search option', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--search', 'error');
      await logsv2(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:search',
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
        id: 'prj_logsv2test',
        name: 'logsv2-test-project',
      });
    });

    it('should filter by deployment ID', async () => {
      let receivedDeploymentId: string | undefined;
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        receivedDeploymentId = req.query.deploymentId as string;
        res.json({
          rows: [createMockLog({ deploymentId: 'dpl_specific123' })],
          hasMoreRows: false,
        });
      });

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--deployment', 'dpl_specific123');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
      expect(receivedDeploymentId).toEqual('dpl_specific123');
    });

    it('should track telemetry for --deployment option', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--deployment', 'dpl_abc123');
      await logsv2(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:deployment',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--request-id option', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'prj_logsv2test',
        name: 'logsv2-test-project',
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
      client.setArgv('logsv2', '--request-id', 'req_specific123');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
      expect(receivedRequestId).toEqual('req_specific123');
    });

    it('should track telemetry for --request-id option', async () => {
      useRequestLogs([]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--request-id', 'req_abc123');
      await logsv2(client);

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

      client.setArgv('logsv2');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput("isn't linked to a project");
    });
  });
});
