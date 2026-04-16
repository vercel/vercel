import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, afterEach, vi, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import api from '../../../../src/commands/api';

const __dirname = dirname(fileURLToPath(import.meta.url));
const minimalOpenApiPath = join(
  __dirname,
  '../../../fixtures/unit/openapi/minimal-openapi.json'
);
const minimalOpenApiJson = readFileSync(minimalOpenApiPath, 'utf-8');

describe('api', () => {
  beforeEach(() => {
    const originalFetch = client.fetch.bind(client);
    vi.spyOn(client, 'fetch').mockImplementation(async (url, opts) => {
      if (url === 'https://openapi.vercel.sh/') {
        return {
          ok: true,
          status: 200,
          text: async () => minimalOpenApiJson,
        } as any;
      }
      return originalFetch(url, opts);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('--help', () => {
    it('prints help message', async () => {
      client.setArgv('api', '--help');
      const exitCode = await api(client);
      expect(exitCode).toEqual(2);
      expect(client.getFullOutput()).toContain(
        'Make authenticated HTTP requests to the Vercel API'
      );
    });
  });

  describe('endpoint validation', () => {
    it('should reject endpoint without leading slash', async () => {
      client.setArgv('api', 'v2/user');
      const exitCode = await api(client);
      expect(exitCode).toEqual(1);
      expect(client.getFullOutput()).toContain(
        'Use an API path starting with /'
      );
    });

    it('should reject protocol-relative URLs to prevent SSRF', async () => {
      client.setArgv('api', '//evil.com/steal-token');
      const exitCode = await api(client);
      expect(exitCode).toEqual(1);
      expect(client.getFullOutput()).toContain(
        'must be a Vercel API path, not an external URL'
      );
    });

    it('should reject URLs that resolve to external hosts', async () => {
      client.setArgv('api', '//attacker.com');
      const exitCode = await api(client);
      expect(exitCode).toEqual(1);
      expect(client.getFullOutput()).toContain(
        'must be a Vercel API path, not an external URL'
      );
    });
  });

  describe('GET requests', () => {
    it('makes GET request to endpoint', async () => {
      client.scenario.get('/v5/test-endpoint', (_req, res) => {
        res.json({ data: { id: 'test_123', name: 'testdata' } });
      });

      client.setArgv('api', '/v5/test-endpoint');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toContain('test_123');
      expect(client.stdout.getFullOutput()).toContain('testdata');
    });

    it('includes team scope when configured', async () => {
      client.config.currentTeam = 'team_abc123';

      client.scenario.get('/v9/projects', (req, res) => {
        expect(req.query.teamId).toBe('team_abc123');
        res.json({ projects: [] });
      });

      client.setArgv('api', '/v9/projects');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
    });
  });

  describe('POST requests', () => {
    it('makes POST request with -F fields', async () => {
      client.scenario.post('/v10/projects', (req, res) => {
        expect(req.body.name).toBe('my-project');
        res.json({ id: 'prj_123', name: 'my-project' });
      });

      client.setArgv('api', '/v10/projects', '-F', 'name=my-project');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toContain('prj_123');
    });

    it('parses typed fields correctly', async () => {
      client.scenario.post('/v10/projects', (req, res) => {
        expect(req.body.public).toBe(true);
        expect(req.body.count).toBe(42);
        expect(req.body.name).toBe('test');
        res.json({ success: true });
      });

      client.setArgv(
        'api',
        '/v10/projects',
        '-F',
        'public=true',
        '-F',
        'count=42',
        '-F',
        'name=test'
      );
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
    });

    it('uses explicit method with -X', async () => {
      client.scenario.put('/v10/projects/prj_123', (req, res) => {
        expect(req.body.name).toBe('updated');
        res.json({ id: 'prj_123', name: 'updated' });
      });

      client.setArgv(
        'api',
        '/v10/projects/prj_123',
        '-X',
        'PUT',
        '-F',
        'name=updated'
      );
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
    });
  });

  describe('DELETE requests', () => {
    it('makes DELETE request', async () => {
      client.scenario.delete('/v13/deployments/dpl_abc123', (_req, res) => {
        res.json({ uid: 'dpl_abc123' });
      });

      client.dangerouslySkipPermissions = true;

      client.setArgv('api', '/v13/deployments/dpl_abc123', '-X', 'DELETE');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
    });
  });

  describe('custom headers', () => {
    it('sends custom headers', async () => {
      client.scenario.get('/v5/test-headers', (req, res) => {
        expect(req.headers['x-custom-header']).toBe('custom-value');
        res.json({ success: true });
      });

      client.setArgv(
        'api',
        '/v5/test-headers',
        '-H',
        'X-Custom-Header: custom-value'
      );
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
    });
  });

  describe('output formatting', () => {
    it('pretty prints JSON by default', async () => {
      client.scenario.get('/v5/test-format', (_req, res) => {
        res.json({ data: { id: 'test_123' } });
      });

      client.setArgv('api', '/v5/test-format');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
      const output = client.stdout.getFullOutput();
      expect(output).toContain('  ');
    });

    it('outputs raw JSON with --raw', async () => {
      client.scenario.get('/v5/test-raw', (_req, res) => {
        res.json({ data: { id: 'raw_123' } });
      });

      client.setArgv('api', '/v5/test-raw', '--raw');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
      const output = client.stdout.getFullOutput().trim();
      expect(output).toBe('{"data":{"id":"raw_123"}}');
    });
  });

  describe('--include flag', () => {
    it('includes response headers when --include is used', async () => {
      client.scenario.get('/v5/test-include', (_req, res) => {
        res.set('X-Custom-Response', 'header-value');
        res.json({ data: { id: 'include_123' } });
      });

      client.setArgv('api', '/v5/test-include', '--include');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
      const output = client.stdout.getFullOutput();
      expect(output).toContain('HTTP');
      expect(output).toContain('200');
    });
  });

  describe('--silent flag', () => {
    it('suppresses output when --silent is used', async () => {
      client.scenario.get('/v5/test-silent', (_req, res) => {
        res.json({ data: { id: 'silent_123' } });
      });

      client.setArgv('api', '/v5/test-silent', '--silent');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
      const output = client.stdout.getFullOutput();
      expect(output).toBe('');
    });
  });

  describe('error handling', () => {
    it('returns non-zero for error responses', async () => {
      client.scenario.get('/v2/nonexistent', (_req, res) => {
        res
          .status(404)
          .json({ error: { code: 'not_found', message: 'Not found' } });
      });

      client.setArgv('api', '/v2/nonexistent');
      const exitCode = await api(client);

      expect(exitCode).toEqual(1);
    });
  });

  describe('telemetry', () => {
    it('tracks endpoint with normalized IDs', async () => {
      client.scenario.get('/v13/deployments/dpl_abc123', (_req, res) => {
        res.json({ uid: 'dpl_abc123' });
      });

      client.setArgv('api', '/v13/deployments/dpl_abc123');
      await api(client);

      const events = client.telemetryEventStore.readonlyEvents;
      const endpointEvent = events.find(e => e.key === 'argument:endpoint');
      expect(endpointEvent).toBeDefined();
      expect(endpointEvent?.value).toBe('/v13/deployments/:deploymentId');
    });

    it('tracks HTTP method', async () => {
      client.scenario.post('/v10/projects', (_req, res) => {
        res.json({ id: 'prj_123' });
      });

      client.setArgv('api', '/v10/projects', '-X', 'POST', '-F', 'name=test');
      await api(client);

      const events = client.telemetryEventStore.readonlyEvents;
      const methodEvent = events.find(e => e.key === 'option:method');
      expect(methodEvent).toBeDefined();
      expect(methodEvent?.value).toBe('POST');
    });
  });

  describe('OpenAPI CLI tag routing', () => {
    it('delegates opted-in tag and operation to OpenAPI resolution', async () => {
      client.setArgv('api', 'test-tag', 'testOp', '--describe', '--refresh');
      const exitCode = await api(client);
      expect(exitCode).toBe(0);
      const out = client.stdout.getFullOutput();
      expect(out).toContain('test-tag');
      expect(out).toContain('first');
    });

    it('lists operations for `api ls <tag>` when the tag is opted in', async () => {
      client.setArgv('api', 'ls', 'test-tag', '--refresh');
      const exitCode = await api(client);
      expect(exitCode).toBe(0);
      expect(client.stdout.getFullOutput()).toContain('test-op-two');
    });
  });
});
