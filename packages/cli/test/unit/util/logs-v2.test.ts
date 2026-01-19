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
    it('should fetch logs with projectId', async () => {
      const mockLogs = [createMockLog()];
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.projectId).toEqual('prj_test');
        res.json({ logs: mockLogs, pagination: {} });
      });

      const result = await fetchRequestLogs(client, { projectId: 'prj_test' });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].id).toEqual('log_123');
    });

    it('should include deploymentId in query when provided', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.deploymentId).toEqual('dpl_specific');
        res.json({ logs: [], pagination: {} });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        deploymentId: 'dpl_specific',
      });
    });

    it('should include environment filter in query', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.environment).toEqual('production');
        res.json({ logs: [], pagination: {} });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        environment: 'production',
      });
    });

    it('should include multiple level filters in query', async () => {
      const receivedLevels: string[] = [];
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        if (Array.isArray(req.query.level)) {
          receivedLevels.push(...req.query.level);
        } else if (req.query.level) {
          receivedLevels.push(req.query.level);
        }
        res.json({ logs: [], pagination: {} });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        level: ['error', 'warning'],
      });

      expect(receivedLevels).toContain('error');
      expect(receivedLevels).toContain('warning');
    });

    it('should include multiple source filters in query', async () => {
      const receivedSources: string[] = [];
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        if (Array.isArray(req.query.source)) {
          receivedSources.push(...req.query.source);
        } else if (req.query.source) {
          receivedSources.push(req.query.source);
        }
        res.json({ logs: [], pagination: {} });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        source: ['serverless', 'edge-function'],
      });

      expect(receivedSources).toContain('serverless');
      expect(receivedSources).toContain('edge-function');
    });

    it('should include statusCode filter in query', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.statusCode).toEqual('500');
        res.json({ logs: [], pagination: {} });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        statusCode: '500',
      });
    });

    it('should include search query in request', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.search).toEqual('timeout');
        res.json({ logs: [], pagination: {} });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        search: 'timeout',
      });
    });

    it('should include limit in query', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.limit).toEqual('50');
        res.json({ logs: [], pagination: {} });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        limit: 50,
      });
    });

    it('should default limit to 100', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.limit).toEqual('100');
        res.json({ logs: [], pagination: {} });
      });

      await fetchRequestLogs(client, { projectId: 'prj_test' });
    });

    it('should include cursor for pagination', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        expect(req.query.cursor).toEqual('cursor_abc123');
        res.json({ logs: [], pagination: {} });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        cursor: 'cursor_abc123',
      });
    });

    it('should parse relative time for --since option', async () => {
      client.scenario.get('/api/logs/request-logs', (req, res) => {
        const sinceMs = parseInt(req.query.since as string, 10);
        const now = Date.now();
        const oneHourAgo = now - 60 * 60 * 1000;
        expect(sinceMs).toBeGreaterThan(oneHourAgo - 1000);
        expect(sinceMs).toBeLessThan(oneHourAgo + 1000);
        res.json({ logs: [], pagination: {} });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
        since: '1h',
      });
    });

    it('should parse ISO date for --since option', async () => {
      const isoDate = '2024-01-15T10:00:00Z';
      const expectedMs = new Date(isoDate).getTime();

      client.scenario.get('/api/logs/request-logs', (req, res) => {
        const sinceMs = parseInt(req.query.since as string, 10);
        expect(sinceMs).toEqual(expectedMs);
        res.json({ logs: [], pagination: {} });
      });

      await fetchRequestLogs(client, {
        projectId: 'prj_test',
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
        res.json({ logs: mockLogs, pagination: { hasMore: false } });
      });

      const logs: RequestLogEntry[] = [];
      for await (const log of fetchAllRequestLogs(client, {
        projectId: 'prj_test',
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
        if (!req.query.cursor) {
          res.json({
            logs: [createMockLog({ id: 'log_page1' })],
            pagination: { next: 'cursor_page2', hasMore: true },
          });
        } else if (req.query.cursor === 'cursor_page2') {
          res.json({
            logs: [createMockLog({ id: 'log_page2' })],
            pagination: { hasMore: false },
          });
        }
      });

      const logs: RequestLogEntry[] = [];
      for await (const log of fetchAllRequestLogs(client, {
        projectId: 'prj_test',
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
          logs: [
            createMockLog({ id: `log_${requestCount}_1` }),
            createMockLog({ id: `log_${requestCount}_2` }),
          ],
          pagination: { next: `cursor_${requestCount + 1}`, hasMore: true },
        });
      });

      const logs: RequestLogEntry[] = [];
      for await (const log of fetchAllRequestLogs(client, {
        projectId: 'prj_test',
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
