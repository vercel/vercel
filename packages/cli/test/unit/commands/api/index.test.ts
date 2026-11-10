import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import api from '../../../../src/commands/api';
import { runTagOperation } from '../../../../src/commands/api/index';
import type { ParsedFlags } from '../../../../src/commands/api/types';
import { takeCliError } from '../../../../src/util/telemetry/cli-error';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api', () => {
  describe('--help', () => {
    it('prints help message', async () => {
      client.setArgv('api', '--help');
      const exitCode = await api(client);
      expect(exitCode).toEqual(0);
      expect(client.getFullOutput()).toContain(
        'Make authenticated HTTP requests to the Vercel API'
      );
    });
  });

  describe('endpoint validation', () => {
    it('should reject endpoint without leading slash', async () => {
      client.setArgv('api', 'v2/user');
      const exitCode = await api(client);
      expect(exitCode).toEqual(2);
      expect(client.getFullOutput()).toContain(
        'Use an API path starting with /'
      );
    });

    it('should reject protocol-relative URLs to prevent SSRF', async () => {
      client.setArgv('api', '//evil.com/steal-token');
      const exitCode = await api(client);
      expect(exitCode).toEqual(2);
      expect(client.getFullOutput()).toContain(
        'must be a Vercel API path, not an external URL'
      );
    });

    it('should reject URLs that resolve to external hosts', async () => {
      client.setArgv('api', '//attacker.com');
      const exitCode = await api(client);
      expect(exitCode).toEqual(2);
      expect(client.getFullOutput()).toContain(
        'must be a Vercel API path, not an external URL'
      );
    });
  });

  describe('GET requests', () => {
    it('makes GET request to endpoint', async () => {
      // Use a custom endpoint to avoid conflict with useUser()
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

      // Skip confirmation prompt for this test (testing request, not confirmation)
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
      // Check for indented output (pretty print)
      const output = client.stdout.getFullOutput();
      expect(output).toContain('  '); // Has indentation
    });

    it('outputs raw JSON with --raw', async () => {
      client.scenario.get('/v5/test-raw', (_req, res) => {
        res.json({ data: { id: 'raw_123' } });
      });

      client.setArgv('api', '/v5/test-raw', '--raw');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
      const output = client.stdout.getFullOutput().trim();
      // Raw output should be compact (no extra indentation)
      expect(output).toBe('{"data":{"id":"raw_123"}}');
    });
  });

  describe('response content types', () => {
    const jsonl = '{"id":"line_1"}\n{"id":"line_2"}\n';

    it('prints a JSON Lines body as text by default', async () => {
      client.scenario.get('/v1/test-jsonl', (_req, res) => {
        res.type('application/jsonl').send(jsonl);
      });

      client.setArgv('api', '/v1/test-jsonl');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toBe(jsonl);
    });

    it('prints a JSON Lines body as text with --raw', async () => {
      client.scenario.get('/v1/test-jsonl-raw', (_req, res) => {
        res.type('application/jsonl; charset=utf-8').send(jsonl);
      });

      client.setArgv('api', '/v1/test-jsonl-raw', '--raw');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toBe(jsonl);
    });

    it('parses JSON with a charset parameter', async () => {
      client.scenario.get('/v1/test-json-charset', (_req, res) => {
        res
          .type('application/json; charset=utf-8')
          .send(JSON.stringify({ id: 'charset_123' }));
      });

      client.setArgv('api', '/v1/test-json-charset', '--raw');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toBe('{"id":"charset_123"}\n');
    });

    it('parses an application/json-*+json media type', async () => {
      client.scenario.get('/v1/test-json-patch', (_req, res) => {
        res
          .type('application/json-patch+json')
          .send(JSON.stringify([{ op: 'add', path: '/a', value: 1 }]));
      });

      client.setArgv('api', '/v1/test-json-patch', '--raw');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toBe(
        '[{"op":"add","path":"/a","value":1}]\n'
      );
    });

    it('prints an application/stream+json body as text', async () => {
      client.scenario.get('/v1/test-stream-json', (_req, res) => {
        res.type('application/stream+json').send(jsonl);
      });

      client.setArgv('api', '/v1/test-stream-json', '--raw');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toBe(jsonl);
    });
  });

  describe('output without a terminal', () => {
    const specUrl = 'https://api.vercel.tools/openapi.json';

    // Serves a spec with a table view and a PATCH operation; every other
    // request goes through to the mock API.
    function useSpecWithTableAndMutation() {
      const realFetch = globalThis.fetch;
      vi.stubGlobal(
        'fetch',
        vi.fn((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
          if (String(input) !== specUrl) {
            return realFetch(input, init);
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({
                openapi: '3.0.3',
                info: { title: 'Custom API', version: '1.0.0' },
                paths: {
                  '/v1/things': {
                    get: {
                      operationId: 'listThings',
                      tags: ['things'],
                      responses: {
                        '200': {
                          content: {
                            'application/json': {
                              schema: {
                                type: 'object',
                                'x-vercel-cli': {
                                  displayColumns: { name: 'things[].name' },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                    patch: {
                      operationId: 'updateThings',
                      tags: ['things'],
                    },
                  },
                },
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }
            )
          );
        })
      );
    }

    beforeEach(() => {
      (client.stdout as any).isTTY = false;
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('prints single-line JSON for an endpoint path', async () => {
      client.scenario.get('/v5/test-piped', (_req, res) => {
        res.json({ data: { id: 'piped_123' } });
      });

      client.setArgv('api', '/v5/test-piped');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toBe(
        '{"data":{"id":"piped_123"}}\n'
      );
    });

    it('prints JSON instead of a table for an OpenAPI operation', async () => {
      useSpecWithTableAndMutation();
      client.scenario.get('/v1/things', (_req, res) => {
        res.json({ things: [{ name: 'first' }] });
      });

      const exitCode = await runTagOperation(client, {
        tag: 'things',
        operationId: 'listThings',
        flags: { '--spec-url': specUrl } as ParsedFlags,
        positionalOperationFields: [],
      });

      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toBe(
        '{"things":[{"name":"first"}]}\n'
      );
    });

    it('prints the response body instead of "Success" for a change', async () => {
      useSpecWithTableAndMutation();
      client.scenario.patch('/v1/things', (_req, res) => {
        res.json({ updated: true });
      });

      const exitCode = await runTagOperation(client, {
        tag: 'things',
        operationId: 'updateThings',
        flags: { '--spec-url': specUrl } as ParsedFlags,
        positionalOperationFields: [],
      });

      expect(exitCode).toEqual(0);
      const output = client.stdout.getFullOutput();
      expect(output).toBe('{"updated":true}\n');
      expect(output).not.toContain('Success');
    });

    it('still honors --silent', async () => {
      client.scenario.get('/v5/test-piped-silent', (_req, res) => {
        res.json({ data: { id: 'silent_123' } });
      });

      client.setArgv('api', '/v5/test-piped-silent', '--silent');
      const exitCode = await api(client);

      expect(exitCode).toEqual(0);
      expect(client.stdout.getFullOutput()).toBe('');
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
      takeCliError();
      const exitCode = await api(client);

      expect(exitCode).toEqual(1);
      expect(takeCliError()).toMatchObject({ code: 'not_found', status: 404 });
    });

    it('keeps a malformed field out of error telemetry', async () => {
      client.setArgv('api', '/v2/user', '-X', 'POST', '-F', 'vca_secret');
      takeCliError();
      const exitCode = await api(client);

      expect(exitCode).toEqual(1);
      expect(client.getFullOutput()).toContain('Invalid field format');
      expect(JSON.stringify(takeCliError() ?? {})).not.toContain('vca_secret');
    });
  });

  describe('--spec-url', () => {
    it('writes the text endpoint listing to stdout, not stderr', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              openapi: '3.0.3',
              info: { title: 'Custom API', version: '1.0.0' },
              paths: {
                '/deployment-files': {
                  get: { summary: 'List retained files' },
                },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        )
      );
      client.setArgv(
        'api',
        'list',
        '--spec-url',
        'https://api.vercel.tools/openapi.json'
      );
      expect(await api(client)).toBe(0);
      expect(client.stdout.getFullOutput()).toContain('/deployment-files');
      expect(client.stdout.getFullOutput()).toContain('List retained files');
      expect(client.stderr.getFullOutput()).not.toContain('/deployment-files');
      expect(client.stdout.getFullOutput()).not.toContain('endpoints');
      expect(client.stderr.getFullOutput()).toContain('1 routes, 1 endpoints');
    });

    it.each([
      { label: '--format json', outputArgs: ['--format', 'json'] },
      { label: '--json', outputArgs: ['--json'] },
    ])('lists endpoints from the custom spec only with $label', async ({
      outputArgs,
    }) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              openapi: '3.0.3',
              info: { title: 'Custom API', version: '1.0.0' },
              paths: {
                '/custom-only': {
                  get: {
                    operationId: 'getCustomOnly',
                    summary: 'Custom only',
                    tags: ['custom'],
                  },
                },
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          )
        )
      );

      client.setArgv(
        'api',
        'ls',
        '--spec-url',
        'https://api.vercel.tools/openapi.json',
        ...outputArgs
      );

      const exitCode = await api(client);
      expect(exitCode).toEqual(0);

      const endpoints = JSON.parse(client.stdout.getFullOutput());
      expect(endpoints).toEqual([
        expect.objectContaining({
          method: 'GET',
          path: '/custom-only',
          operationId: 'getCustomOnly',
        }),
      ]);
    });

    it('prints a clear error when the custom URL is not an OpenAPI spec', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              generatedAt: '2026-06-10T17:01:31.100Z',
              services: [],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          )
        )
      );

      client.setArgv(
        'api',
        '--spec-url',
        'https://api.vercel.tools/manifest.json',
        '--refresh'
      );

      const exitCode = await api(client);
      expect(exitCode).toEqual(1);
      expect(client.getFullOutput()).toContain(
        'Invalid OpenAPI spec from https://api.vercel.tools/manifest.json: expected an OpenAPI 3.x document with an "openapi" field.'
      );
    });
  });

  describe('telemetry', () => {
    it('tracks endpoint with normalized IDs', async () => {
      client.scenario.get('/v13/deployments/dpl_abc123', (_req, res) => {
        res.json({ uid: 'dpl_abc123' });
      });

      client.setArgv('api', '/v13/deployments/dpl_abc123');
      await api(client);

      // Check that the endpoint is tracked with normalized IDs
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

      // Check that the method is tracked
      const events = client.telemetryEventStore.readonlyEvents;
      const methodEvent = events.find(e => e.key === 'option:method');
      expect(methodEvent).toBeDefined();
      expect(methodEvent?.value).toBe('POST');
    });
  });
});
