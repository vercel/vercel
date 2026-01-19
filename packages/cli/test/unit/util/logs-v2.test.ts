import { describe, it, expect, beforeEach } from 'vitest';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import {
  fetchRequestLogs,
  fetchAllRequestLogs,
  resolveDeploymentId,
  type RequestLogEntry,
} from '../../../src/util/logs-v2';

function createMockLog(
  overrides: Partial<RequestLogEntry> = {}
): RequestLogEntry {
  return {
    id: 'log_123',
    timestamp: Date.now(),
    deploymentId: 'dpl_test123',
    projectId: 'prj_test',
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

describe('logs-v2 utility', () => {
  beforeEach(() => {
    useUser();
  });

  describe('fetchRequestLogs', () => {
    it('should fetch logs with projectId and ownerId', async () => {
      const mockLogs = [createMockLog()];
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
        createMockLog({ id: 'log_1' }),
        createMockLog({ id: 'log_2' }),
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
            rows: [createMockLog({ id: 'log_page1' })],
            hasMoreRows: true,
          });
        } else if (page === '1') {
          res.json({
            rows: [createMockLog({ id: 'log_page2' })],
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
            createMockLog({ id: `log_${requestCount}_1` }),
            createMockLog({ id: `log_${requestCount}_2` }),
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

  describe('resolveDeploymentId', () => {
    it('should return deployment ID as-is if it starts with dpl_', async () => {
      const result = await resolveDeploymentId(client, 'dpl_abc123');
      expect(result).toEqual('dpl_abc123');
    });

    it('should return ID as-is if it does not contain a dot', async () => {
      const result = await resolveDeploymentId(client, 'abc123');
      expect(result).toEqual('abc123');
    });

    it('should resolve URL to deployment ID', async () => {
      client.scenario.get('/v13/deployments/get', (req, res) => {
        expect(req.query.url).toEqual('my-app.vercel.app');
        res.json({ id: 'dpl_resolved123' });
      });

      const result = await resolveDeploymentId(client, 'my-app.vercel.app');
      expect(result).toEqual('dpl_resolved123');
    });

    it('should handle full URL with https', async () => {
      client.scenario.get('/v13/deployments/get', (req, res) => {
        expect(req.query.url).toEqual('my-app.vercel.app');
        res.json({ id: 'dpl_fromhttps' });
      });

      const result = await resolveDeploymentId(
        client,
        'https://my-app.vercel.app'
      );
      expect(result).toEqual('dpl_fromhttps');
    });

    it('should return input on resolution failure', async () => {
      client.scenario.get('/v13/deployments/get', (_req, res) => {
        res.status(404).json({ error: { code: 'not_found' } });
      });

      const result = await resolveDeploymentId(client, 'unknown.vercel.app');
      expect(result).toEqual('unknown.vercel.app');
    });
  });
});
