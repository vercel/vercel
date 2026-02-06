import { beforeEach, describe, expect, it } from 'vitest';
import {
  fetchAllRequestLogs,
  fetchRequestLogs,
  type RequestLogEntry,
} from '../../../src/util/logs-v2';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';

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

function createMockApiLog(overrides: Partial<ApiLogEntry> = {}): ApiLogEntry {
  return {
    requestId: 'log_123',
    timestamp: new Date().toISOString(),
    deploymentId: 'dpl_test123',
    requestMethod: 'GET',
    requestPath: '/api/test',
    statusCode: 200,
    environment: 'production',
    domain: 'test.vercel.app',
    logs: [{ level: 'info', message: 'Test log message' }],
    events: [{ source: 'serverless' }],
    ...overrides,
  };
}

describe('logs-v2 utility', () => {
  beforeEach(() => {
    useUser();
  });

  describe('fetchRequestLogs', () => {
    it('should fetch logs with projectId and ownerId', async () => {
      const mockLogs = [createMockApiLog()];
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.projectId).toEqual('prj_test');
        expect(req.query.ownerId).toEqual('team_test');
        res.json({ rows: mockLogs, hasMoreRows: false });
      });

      const result = await fetchRequestLogs(client, {
        projectId: 'prj_test',
        ownerId: 'team_test',
      });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].id).toEqual('log_123');
    });

    it('should include deploymentId in query when provided', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.deploymentId).toEqual('dpl_specific');
        res.json({ rows: [], hasMoreRows: false });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        ownerId: 'team_test',
        deploymentId: 'dpl_specific',
      });
    });

    it('should include environment filter in query', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.environment).toEqual('production');
        res.json({ rows: [], hasMoreRows: false });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        ownerId: 'team_test',
        environment: 'production',
      });
    });

    it('should include multiple level filters in query', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.level).toEqual('error,warning');
        res.json({ rows: [], hasMoreRows: false });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        ownerId: 'team_test',
        level: ['error', 'warning'],
      });
    });

    it('should include multiple source filters in query', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.source).toEqual('serverless,edge-function');
        res.json({ rows: [], hasMoreRows: false });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        ownerId: 'team_test',
        source: ['serverless', 'edge-function'],
      });
    });

    it('should include statusCode filter in query', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.statusCode).toEqual('500');
        res.json({ rows: [], hasMoreRows: false });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        ownerId: 'team_test',
        statusCode: '500',
      });
    });

    it('should include search query in request', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.search).toEqual('timeout');
        res.json({ rows: [], hasMoreRows: false });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        ownerId: 'team_test',
        search: 'timeout',
      });
    });

    it('should include requestId filter in query', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.requestId).toEqual('req_abc123');
        res.json({ rows: [], hasMoreRows: false });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        ownerId: 'team_test',
        requestId: 'req_abc123',
      });
    });

    it('should parse relative time for --since option', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        const startDateMs = parseInt(req.query.startDate as string, 10);
        const now = Date.now();
        const oneHourAgo = now - 60 * 60 * 1000;
        expect(startDateMs).toBeGreaterThan(oneHourAgo - 1000);
        expect(startDateMs).toBeLessThan(oneHourAgo + 1000);
        res.json({ rows: [], hasMoreRows: false });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        ownerId: 'team_test',
        since: '1h',
      });
    });

    it('should parse ISO date for --since option', async () => {
      const isoDate = '2024-01-15T10:00:00Z';
      const expectedMs = new Date(isoDate).getTime();

      client.scenario.get('/api/logs/request-logs', (req, res) => {
        const startDateMs = parseInt(req.query.startDate as string, 10);
        expect(startDateMs).toEqual(expectedMs);
        res.json({ rows: [], hasMoreRows: false });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        ownerId: 'team_test',
        since: isoDate,
      });
    });
  });

  describe('fetchAllRequestLogs', () => {
    it('should yield all logs from single page', async () => {
      const mockLogs = [
        createMockApiLog({ requestId: 'log_1' }),
        createMockApiLog({ requestId: 'log_2' }),
      ];
      client.scenario.get('/api/logs/request-logs', (_req, res) => {
        res.json({ rows: mockLogs, hasMoreRows: false });
      });

      const logs: RequestLogEntry[] = [];
      for await (const log of fetchAllRequestLogs(client, {
        projectId: 'prj_test',
        ownerId: 'team_test',
      })) {
        logs.push(log);
      }

      expect(logs).toHaveLength(2);
      expect(logs[0].id).toEqual('log_1');
      expect(logs[1].id).toEqual('log_2');
    });

    it('should paginate through multiple pages', async () => {
      let requestCount = 0;
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        requestCount++;
        const page = req.query.page;
        if (page === '0') {
          res.json({
            rows: [createMockApiLog({ requestId: 'log_page1' })],
            hasMoreRows: true,
          });
        } else if (page === '1') {
          res.json({
            rows: [createMockApiLog({ requestId: 'log_page2' })],
            hasMoreRows: false,
          });
        }
      });

      const logs: RequestLogEntry[] = [];
      for await (const log of fetchAllRequestLogs(client, {
        projectId: 'prj_test',
        ownerId: 'team_test',
        limit: 200,
      })) {
        logs.push(log);
      }

      expect(logs).toHaveLength(2);
      expect(logs[0].id).toEqual('log_page1');
      expect(logs[1].id).toEqual('log_page2');
      expect(requestCount).toEqual(2);
    });

    it('should respect limit across pages', async () => {
      let requestCount = 0;
      client.scenario.get('/api/logs/request-logs', (_req, res) => {
        requestCount++;
        res.json({
          rows: [
            createMockApiLog({ requestId: `log_${requestCount}_1` }),
            createMockApiLog({ requestId: `log_${requestCount}_2` }),
          ],
          hasMoreRows: true,
        });
      });

      const logs: RequestLogEntry[] = [];
      for await (const log of fetchAllRequestLogs(client, {
        projectId: 'prj_test',
        ownerId: 'team_test',
        limit: 3,
      })) {
        logs.push(log);
      }

      expect(logs).toHaveLength(3);
    });
  });
});
