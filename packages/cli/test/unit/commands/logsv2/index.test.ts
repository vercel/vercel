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
  client.scenario.get('/api/logs/request-logs', (req, res) => {
    res.json({
      logs,
      pagination: {
        hasMore: false,
      },
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
      const errorLog = createMockLog({
        level: 'error',
        message: 'Error occurred',
      });
      useRequestLogs([errorLog]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--level', 'error');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
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
      useRequestLogs([createMockLog({ environment: 'production' })]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--environment', 'production');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
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
      useRequestLogs([createMockLog({ source: 'serverless' })]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--source', 'serverless');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
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
      useRequestLogs([createMockLog({ responseStatusCode: 500 })]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--status-code', '500');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
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
      useRequestLogs([createMockLog()]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--since', '1h');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
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
      useRequestLogs([createMockLog({ message: 'timeout error occurred' })]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--search', 'timeout');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
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
      useRequestLogs([createMockLog({ deploymentId: 'dpl_specific123' })]);

      client.cwd = fixture('linked-project');
      client.setArgv('logsv2', '--deployment', 'dpl_specific123');
      const exitCode = await logsv2(client);

      expect(exitCode).toEqual(0);
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
