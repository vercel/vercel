import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import routes from '../../../../src/commands/routes';
import { useUser } from '../../../mocks/user';
import { useAddRoute, usePromoteRouteVersion } from '../../../mocks/routes';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

describe('routes add', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'routes-test-project',
      name: 'routes-test',
    });
    const cwd = setupUnitFixture('commands/routes');
    client.cwd = cwd;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'routes';
      const subcommand = 'add';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = routes(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('non-interactive mode', () => {
    it('should add a basic rewrite route', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'API Proxy',
        '--src',
        '/api/:path*',
        '--src-syntax',
        'path-to-regexp',
        '--action',
        'rewrite',
        '--dest',
        'https://api.example.com/:path*',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Adding route');
      await expect(client.stderr).toOutput('Created');
      await expect(client.stderr).toOutput('API Proxy');
      await expect(client.stderr).toOutput('Rewrite');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should add a redirect route', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'Old Blog Redirect',
        '--src',
        '/blog',
        '--src-syntax',
        'equals',
        '--action',
        'redirect',
        '--dest',
        '/articles',
        '--status',
        '301',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Redirect: /articles (301)');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should add a set-status route (terminate)', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'Block Admin',
        '--src',
        '^/admin/.*$',
        '--action',
        'set-status',
        '--status',
        '403',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Status: 403');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should add route with response headers', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'Cache Headers',
        '--src',
        '/static/:path*',
        '--src-syntax',
        'path-to-regexp',
        '--set-response-header',
        'Cache-Control=public, max-age=31536000',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Created');
      await expect(client.stderr).toOutput('Cache Headers');
      await expect(client.stderr).toOutput('header');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should add route with multiple response header operations', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'CORS Headers',
        '--src',
        '/api/:path*',
        '--src-syntax',
        'path-to-regexp',
        '--set-response-header',
        'Access-Control-Allow-Origin=*',
        '--set-response-header',
        'Access-Control-Allow-Methods=GET, POST, OPTIONS',
        '--delete-response-header',
        'X-Powered-By',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Created');
      await expect(client.stderr).toOutput('transform');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should add route with request transforms', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'Add Host Header',
        '--src',
        '/proxy/:path*',
        '--src-syntax',
        'path-to-regexp',
        '--action',
        'rewrite',
        '--dest',
        'https://backend.com/:path*',
        '--set-request-header',
        'X-Forwarded-Host=myapp.com',
        '--set-request-query',
        'version=2',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Created');
      await expect(client.stderr).toOutput('Transform');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should add route with --has conditions', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'Auth API',
        '--src',
        '/api/:path*',
        '--src-syntax',
        'path-to-regexp',
        '--action',
        'rewrite',
        '--dest',
        '/protected-api',
        '--has',
        'header:Authorization',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Conditions: 1 has, 0 missing');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should add route with --missing conditions', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'Public API',
        '--src',
        '/api/:path*',
        '--src-syntax',
        'path-to-regexp',
        '--action',
        'rewrite',
        '--dest',
        '/public-api',
        '--missing',
        'header:Authorization',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Conditions: 0 has, 1 missing');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should add route with multiple conditions', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'Complex Route',
        '--src',
        '/api/:path*',
        '--src-syntax',
        'path-to-regexp',
        '--action',
        'rewrite',
        '--dest',
        '/handler',
        '--has',
        'header:X-Admin-Token',
        '--has',
        'query:debug',
        '--has',
        'cookie:admin_session',
        '--missing',
        'header:X-Block',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Conditions: 3 has, 1 missing');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should add route with description', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--src-syntax',
        'equals',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
        '--description',
        'This is a test route',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Created');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should add route with --disabled flag', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'Disabled Route',
        '--src',
        '/disabled',
        '--src-syntax',
        'equals',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
        '--disabled',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Created');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should add route with --position start', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'Priority Route',
        '--src',
        '/priority',
        '--src-syntax',
        'equals',
        '--action',
        'rewrite',
        '--dest',
        '/handler',
        '--position',
        'start',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Created');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should add route with --position after:id', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'After Route',
        '--src',
        '/after',
        '--src-syntax',
        'equals',
        '--action',
        'rewrite',
        '--dest',
        '/handler',
        '--position',
        'after:abc123',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Created');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('tracks subcommand invocation', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'Test Route',
        '--src',
        '/test',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
        '--yes'
      );
      const exitCode = await routes(client);

      expect(exitCode).toEqual(0);
      // Verify key telemetry events are present
      const events = client.telemetryEventStore.readonlyEvents;
      expect(events.find(e => e.key === 'subcommand:add')).toBeDefined();
      expect(events.find(e => e.key === 'flag:yes')).toBeDefined();
      expect(events.find(e => e.key === 'option:src')).toBeDefined();
      expect(events.find(e => e.key === 'option:dest')).toBeDefined();
      expect(
        events.find(e => e.key === 'option:action-type' && e.value === 'rewrite')
      ).toBeDefined();
    });
  });

  describe('validation errors', () => {
    it('should error when name is missing with --yes', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        '--src',
        '/path',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Route name is required');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error when --src is missing with --yes', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Source path is required');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on name too long', async () => {
      useAddRoute();

      const longName = 'a'.repeat(257);
      client.setArgv(
        'routes',
        'add',
        longName,
        '--src',
        '/path',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('256 characters or less');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on description too long', async () => {
      useAddRoute();

      const longDescription = 'a'.repeat(1025);
      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
        '--description',
        longDescription,
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('1024 characters or less');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on invalid syntax type', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--src-syntax',
        'invalid',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Invalid syntax');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on invalid position format', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
        '--position',
        'invalid',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Invalid position');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on invalid condition format', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
        '--has',
        'invalid',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Invalid condition');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on invalid condition type', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
        '--has',
        'unknown:key',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Invalid condition type');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error when --action rewrite has --status', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
        '--status',
        '404',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('does not accept --status');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error when --dest without --action', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--dest',
        '/dest',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('--action is required');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error when --action is invalid', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'foobar',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Invalid action type');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error when --action redirect without --status', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'redirect',
        '--dest',
        '/dest',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('requires --status');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error when --action redirect has non-redirect status', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'redirect',
        '--dest',
        '/dest',
        '--status',
        '404',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Invalid redirect status');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error when --action set-status without --status', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'set-status',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('requires --status');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on invalid transform format', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
        '--set-response-header',
        'InvalidNoEquals',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Invalid');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error when no action is provided with --yes', async () => {
      useAddRoute();

      client.setArgv('routes', 'add', 'My Route', '--src', '/path', '--yes');
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('At least one action is required');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on status code below 100', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'set-status',
        '--status',
        '99',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput(
        'Status code must be an integer between 100 and 599'
      );

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on status code above 599', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'set-status',
        '--status',
        '600',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput(
        'Status code must be an integer between 100 and 599'
      );

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on non-integer status code', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'set-status',
        '--status',
        '301.5',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput(
        'Status code must be an integer between 100 and 599'
      );

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should send enabled: false when --disabled is used', async () => {
      let capturedBody: unknown;

      client.scenario.get(
        '/v1/projects/:projectId/routes/versions',
        (_req, res) => {
          res.json({
            versions: [
              {
                id: 'staging-version',
                isLive: false,
                isStaging: true,
                ruleCount: 1,
              },
            ],
          });
        }
      );

      client.scenario.post('/v1/projects/:projectId/routes', (req, res) => {
        capturedBody = req.body;
        res.json({
          route: {
            id: 'new-route-id',
            name: 'Disabled Route',
            enabled: false,
            staged: true,
            route: req.body.route.route,
          },
          version: {
            id: 'new-staging',
            isStaging: true,
            ruleCount: 1,
          },
        });
      });

      client.setArgv(
        'routes',
        'add',
        'Disabled Route',
        '--src',
        '/disabled',
        '--action',
        'rewrite',
        '--dest',
        '/target',
        '--disabled',
        '--yes'
      );

      await expect(routes(client)).resolves.toEqual(0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = capturedBody as any;
      expect(body.route.enabled).toBe(false);
    });

    it('should handle feature_not_enabled error from API', async () => {
      client.scenario.get(
        '/v1/projects/:projectId/routes/versions',
        (_req, res) => {
          res.json({
            versions: [
              {
                id: 'live-version',
                isLive: true,
                isStaging: false,
                ruleCount: 0,
              },
            ],
          });
        }
      );

      client.scenario.post('/v1/projects/:projectId/routes', (_req, res) => {
        res.status(403).json({
          error: {
            code: 'feature_not_enabled',
            message: 'Project-level routes are not enabled for this project.',
          },
        });
      });

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'rewrite',
        '--dest',
        '/target',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('not enabled');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error when too many conditions (>16)', async () => {
      useAddRoute();

      // Create 17 conditions (exceeds max of 16)
      const args = [
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
      ];
      for (let i = 0; i < 17; i++) {
        args.push('--has', `header:X-Header-${i}`);
      }
      args.push('--yes');

      client.setArgv(...args);
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Too many conditions');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on position after: without ID', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
        '--position',
        'after:',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('requires a route ID');

      await expect(exitCodePromise).resolves.toEqual(1);
    });
  });

  describe('auto-promote logic', () => {
    it('should offer to promote when no existing staging', async () => {
      useAddRoute({ hasStaging: false });
      usePromoteRouteVersion();

      // Provide all required fields except --yes to trigger auto-promote prompt
      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'rewrite',
        '--dest',
        '/dest'
      );
      const exitCodePromise = routes(client);

      // The only prompt should be the auto-promote confirmation
      await expect(client.stderr).toOutput('only staged change');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Promoted');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should warn about other staged changes', async () => {
      useAddRoute({ hasStaging: true });

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--action',
        'rewrite',
        '--dest',
        '/dest',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('other staged changes');

      await expect(exitCodePromise).resolves.toEqual(0);
    });
  });

  describe('test URL generation', () => {
    it('should show test URL for exact syntax', async () => {
      useAddRoute({ alias: 'test-alias.vercel.app' });

      client.setArgv(
        'routes',
        'add',
        'Exact Route',
        '--src',
        '/about',
        '--src-syntax',
        'equals',
        '--action',
        'rewrite',
        '--dest',
        '/about-page',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput(
        'https://test-alias.vercel.app/about'
      );

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should show test URL for path-to-regexp syntax', async () => {
      useAddRoute({ alias: 'test-alias.vercel.app' });

      client.setArgv(
        'routes',
        'add',
        'Path Route',
        '--src',
        '/api/:version/users/:id',
        '--src-syntax',
        'path-to-regexp',
        '--action',
        'rewrite',
        '--dest',
        '/handler',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput(
        'https://test-alias.vercel.app/api/test/users/test'
      );

      await expect(exitCodePromise).resolves.toEqual(0);
    });
  });

  // =====================================================
  // COMPREHENSIVE EXAMPLES - Full Functionality Showcase
  // =====================================================
  describe('comprehensive examples', () => {
    describe('rewrites', () => {
      it('should add a rewrite with regex syntax (default)', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'API Rewrite',
          '--src',
          '^/api/(.*)$',
        '--action',
        'rewrite',
          '--dest',
          'https://api.backend.com/$1',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should add a rewrite with path-to-regexp syntax', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'User API',
          '--src',
          '/users/:userId/posts/:postId',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'rewrite',
          '--dest',
          'https://api.example.com/users/:userId/posts/:postId',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should add a rewrite with wildcard path-to-regexp', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Catch All API',
          '--src',
          '/api/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'rewrite',
          '--dest',
          'https://api.example.com/:path*',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should add a rewrite with request headers', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Proxy with Auth',
          '--src',
          '/proxy/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'rewrite',
          '--dest',
          'https://secure-backend.com/:path*',
          '--set-request-header',
          'Authorization=Bearer internal-token',
          '--set-request-header',
          'X-Forwarded-Host=myapp.com',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });
    });

    describe('redirects', () => {
      it('should add a 301 permanent redirect', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Old URL Redirect',
          '--src',
          '/old-page',
          '--src-syntax',
          'equals',
        '--action',
        'redirect',
          '--dest',
          '/new-page',
          '--status',
          '301',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should add a 302 found redirect', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Temp Redirect',
          '--src',
          '/temp',
          '--src-syntax',
          'equals',
        '--action',
        'redirect',
          '--dest',
          '/temporary-location',
          '--status',
          '302',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should add a 307 temporary redirect (preserves method)', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'API Maintenance',
          '--src',
          '^/api/v1/.*$',
        '--action',
        'redirect',
          '--dest',
          '/maintenance',
          '--status',
          '307',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should add a 308 permanent redirect (preserves method)', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'API Version Upgrade',
          '--src',
          '/api/v1/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'redirect',
          '--dest',
          '/api/v2/:path*',
          '--status',
          '308',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should add an external redirect', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'External Docs',
          '--src',
          '/docs',
          '--src-syntax',
          'equals',
        '--action',
        'redirect',
          '--dest',
          'https://docs.example.com/',
          '--status',
          '301',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });
    });

    describe('status codes (terminate)', () => {
      it('should add a 403 forbidden route', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Block Admin',
          '--src',
          '^/admin/.*$',
        '--action',
        'set-status',
          '--status',
          '403',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should add a 404 not found route', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Hide Secret Path',
          '--src',
          '/secret/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'set-status',
          '--status',
          '404',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should add a 503 maintenance route', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Maintenance Mode',
          '--src',
          '.*',
        '--action',
        'set-status',
          '--status',
          '503',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });
    });

    describe('response headers', () => {
      it('should add cache control headers', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Static Cache',
          '--src',
          '/static/:path*',
          '--src-syntax',
          'path-to-regexp',
          '--set-response-header',
          'Cache-Control=public, max-age=31536000, immutable',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should add CORS headers', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'CORS Headers',
          '--src',
          '/api/:path*',
          '--src-syntax',
          'path-to-regexp',
          '--set-response-header',
          'Access-Control-Allow-Origin=*',
          '--set-response-header',
          'Access-Control-Allow-Methods=GET, POST, PUT, DELETE, OPTIONS',
          '--set-response-header',
          'Access-Control-Allow-Headers=Content-Type, Authorization',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should add security headers', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Security Headers',
          '--src',
          '.*',
          '--set-response-header',
          'X-Content-Type-Options=nosniff',
          '--set-response-header',
          'X-Frame-Options=DENY',
          '--set-response-header',
          'Strict-Transport-Security=max-age=31536000; includeSubDomains',
          '--delete-response-header',
          'X-Powered-By',
          '--delete-response-header',
          'Server',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should append to existing headers', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Append CSP',
          '--src',
          '.*',
          '--append-response-header',
          'Content-Security-Policy=frame-ancestors none',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });
    });

    describe('request transforms', () => {
      it('should add request headers for backend auth', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Backend Auth Headers',
          '--src',
          '/internal/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'rewrite',
          '--dest',
          'https://internal-api.example.com/:path*',
          '--set-request-header',
          'X-Internal-Auth=secret-key',
          '--set-request-header',
          'X-Request-Source=frontend',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should modify query parameters', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Add API Version',
          '--src',
          '/api/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'rewrite',
          '--dest',
          '/api-handler/:path*',
          '--set-request-query',
          'api_version=2',
          '--set-request-query',
          'client=web',
          '--delete-request-query',
          'debug',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should strip sensitive query params', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Strip Tokens',
          '--src',
          '/webhook/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'rewrite',
          '--dest',
          'https://webhook-handler.example.com/:path*',
          '--delete-request-query',
          'secret',
          '--delete-request-query',
          'token',
          '--delete-request-query',
          'api_key',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });
    });

    describe('conditions (--has and --missing)', () => {
      it('should route based on header presence', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Auth Required',
          '--src',
          '/protected/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'rewrite',
          '--dest',
          '/api/protected/:path*',
          '--has',
          'header:Authorization',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should route based on header value', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Admin Only',
          '--src',
          '/admin/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'rewrite',
          '--dest',
          '/admin-api/:path*',
          '--has',
          'header:X-Admin-Role:super-admin',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should route based on cookie', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Logged In Users',
          '--src',
          '/dashboard/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'rewrite',
          '--dest',
          '/user-dashboard/:path*',
          '--has',
          'cookie:session_id',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should route based on query parameter', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Debug Mode',
          '--src',
          '/api/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'rewrite',
          '--dest',
          '/debug-api/:path*',
          '--has',
          'query:debug',
          '--has',
          'query:verbose:true',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should route based on host', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'API Subdomain',
          '--src',
          '/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'rewrite',
          '--dest',
          '/api-handler/:path*',
          '--has',
          'host:api.example.com',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should redirect when auth is missing', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Login Redirect',
          '--src',
          '/dashboard/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'redirect',
          '--dest',
          '/login?redirect=/dashboard/:path*',
          '--status',
          '307',
          '--missing',
          'cookie:auth_token',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should combine has and missing conditions', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Complex Auth',
          '--src',
          '/api/admin/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'rewrite',
          '--dest',
          '/admin-handler/:path*',
          '--has',
          'header:Authorization',
          '--has',
          'cookie:admin_session',
          '--missing',
          'header:X-Blocked',
          '--missing',
          'query:bypass',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });
    });

    describe('combined features', () => {
      it('should add rewrite with conditions and request headers', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Premium API',
          '--src',
          '/api/premium/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'rewrite',
          '--dest',
          'https://premium-api.example.com/:path*',
          '--has',
          'header:X-Premium-User:true',
          '--set-request-header',
          'X-Forwarded-For=client-ip',
          '--set-request-query',
          'tier=premium',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should add rewrite with response headers', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Cached API',
          '--src',
          '/api/cached/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'rewrite',
          '--dest',
          'https://api.example.com/:path*',
          '--set-response-header',
          'Cache-Control=public, max-age=300',
          '--set-response-header',
          'X-Cache=HIT',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should add route with description and disabled', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Future Feature',
          '--src',
          '/feature-flag/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'rewrite',
          '--dest',
          '/new-feature/:path*',
          '--description',
          'Routing for upcoming feature - enable when ready to launch',
          '--disabled',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should add route at specific position', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'High Priority Block',
          '--src',
          '/blocked/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'set-status',
          '--status',
          '403',
          '--position',
          'start',
          '--description',
          'Block access to sensitive paths - must be first',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should add redirect with multiple conditions', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Mobile Redirect',
          '--src',
          '/:path*',
          '--src-syntax',
          'path-to-regexp',
        '--action',
        'redirect',
          '--dest',
          'https://m.example.com/:path*',
          '--status',
          '307',
          '--has',
          'header:X-Mobile:true',
          '--missing',
          'cookie:prefer_desktop',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });
    });

    describe('edge cases', () => {
      it('should handle special characters in header values', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'Special Headers',
          '--src',
          '/:path*',
          '--src-syntax',
          'path-to-regexp',
          '--set-response-header',
          "Content-Security-Policy=default-src 'self'; script-src 'unsafe-inline'",
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should handle colons in condition values', async () => {
        useAddRoute();
        client.setArgv(
          'routes',
          'add',
          'URL Condition',
          '--src',
          '/proxy',
          '--src-syntax',
          'equals',
        '--action',
        'rewrite',
          '--dest',
          '/handler',
          '--has',
          'query:redirect:https://example.com',
          '--yes'
        );
        await expect(routes(client)).resolves.toEqual(0);
      });

      it('should allow 16 conditions (max)', async () => {
        useAddRoute();
        const args = [
          'routes',
          'add',
          'Max Conditions',
          '--src',
          '/complex',
          '--src-syntax',
          'equals',
        '--action',
        'rewrite',
          '--dest',
          '/handler',
        ];
        // Add exactly 16 conditions
        for (let i = 0; i < 16; i++) {
          args.push('--has', `header:X-Header-${i}`);
        }
        args.push('--yes');
        client.setArgv(...args);
        await expect(routes(client)).resolves.toEqual(0);
      });
    });
  });

  describe('quote stripping safeguard', () => {
    it('should strip double quotes from --src', async () => {
      useAddRoute();
      // Simulating when user accidentally includes quotes in the value
      client.setArgv(
        'routes',
        'add',
        'Quoted Src',
        '--src',
        '"^/old-blog/(.*)$"',
        '--action',
        'rewrite',
        '--dest',
        '/blog/$1',
        '--yes'
      );
      // Should succeed (quotes stripped, valid regex)
      await expect(routes(client)).resolves.toEqual(0);
    });

    it('should strip single quotes from --src', async () => {
      useAddRoute();
      client.setArgv(
        'routes',
        'add',
        'Single Quoted Src',
        '--src',
        "'^/api/(.*)$'",
        '--action',
        'rewrite',
        '--dest',
        '/handler/$1',
        '--yes'
      );
      // Should succeed (quotes stripped, valid regex)
      await expect(routes(client)).resolves.toEqual(0);
    });

    it('should strip double quotes from --dest', async () => {
      useAddRoute();
      client.setArgv(
        'routes',
        'add',
        'Quoted Dest',
        '--src',
        '^/old/(.*)$',
        '--action',
        'rewrite',
        '--dest',
        '"/new/$1"',
        '--yes'
      );
      // Should succeed (quotes stripped from dest)
      await expect(routes(client)).resolves.toEqual(0);
    });

    it('should strip single quotes from --dest', async () => {
      useAddRoute();
      client.setArgv(
        'routes',
        'add',
        'Single Quoted Dest',
        '--src',
        '^/proxy/(.*)$',
        '--action',
        'rewrite',
        '--dest',
        "'https://api.example.com/$1'",
        '--yes'
      );
      // Should succeed (quotes stripped from dest)
      await expect(routes(client)).resolves.toEqual(0);
    });

    it('should handle quotes in both --src and --dest', async () => {
      useAddRoute();
      client.setArgv(
        'routes',
        'add',
        'Both Quoted',
        '--src',
        '"^/old-blog/(.*)$"',
        '--action',
        'redirect',
        '--dest',
        '"/blog/$1"',
        '--status',
        '301',
        '--yes'
      );
      // Should succeed (quotes stripped from both)
      await expect(routes(client)).resolves.toEqual(0);
    });

    it('should not strip mismatched quotes', async () => {
      useAddRoute();
      // Mismatched quotes should remain (edge case, user error)
      // The leading quote stays and becomes part of the regex pattern
      // (which is still technically valid, just matches a literal ")
      client.setArgv(
        'routes',
        'add',
        'Mismatched Quotes',
        '--src',
        '"^/api/(.*)$',
        '--action',
        'rewrite',
        '--dest',
        '/handler/$1',
        '--yes'
      );
      // Succeeds because the pattern is still valid regex
      // (just includes a literal " at the start)
      await expect(routes(client)).resolves.toEqual(0);
    });
  });

  describe('srcSyntax behavior', () => {
    it('should send srcSyntax and raw pattern to API', async () => {
      let capturedBody: unknown;

      client.scenario.get(
        '/v1/projects/:projectId/routes/versions',
        (_req, res) => {
          res.json({
            versions: [
              {
                id: 'live-version',
                isLive: true,
                isStaging: false,
                ruleCount: 0,
              },
            ],
          });
        }
      );

      client.scenario.post('/v1/projects/:projectId/routes', (req, res) => {
        capturedBody = req.body;
        res.json({
          route: {
            id: 'new-route-id',
            name: 'Pattern Route',
            enabled: true,
            staged: true,
            route: req.body.route.route,
          },
          version: {
            id: 'new-staging',
            isStaging: true,
            ruleCount: 1,
            alias: 'test.vercel.app',
          },
        });
      });

      client.setArgv(
        'routes',
        'add',
        'Pattern Route',
        '--src',
        '/api/:version/users/:id',
        '--src-syntax',
        'path-to-regexp',
        '--action',
        'rewrite',
        '--dest',
        '/handler/:version/:id',
        '--yes'
      );

      await expect(routes(client)).resolves.toEqual(0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = capturedBody as any;
      // Raw pattern should be sent as-is (not compiled to regex)
      expect(body.route.route.src).toBe('/api/:version/users/:id');
      // srcSyntax should be sent alongside the route
      expect(body.route.srcSyntax).toBe('path-to-regexp');
    });

    it('should send equals syntax for equals match', async () => {
      let capturedBody: unknown;

      client.scenario.get(
        '/v1/projects/:projectId/routes/versions',
        (_req, res) => {
          res.json({
            versions: [
              {
                id: 'live-version',
                isLive: true,
                isStaging: false,
                ruleCount: 0,
              },
            ],
          });
        }
      );

      client.scenario.post('/v1/projects/:projectId/routes', (req, res) => {
        capturedBody = req.body;
        res.json({
          route: {
            id: 'new-route-id',
            name: 'Exact Route',
            enabled: true,
            staged: true,
            route: req.body.route.route,
          },
          version: {
            id: 'new-staging',
            isStaging: true,
            ruleCount: 1,
            alias: 'test.vercel.app',
          },
        });
      });

      client.setArgv(
        'routes',
        'add',
        'Exact Route',
        '--src',
        '/about',
        '--src-syntax',
        'equals',
        '--action',
        'rewrite',
        '--dest',
        '/about-page',
        '--yes'
      );

      await expect(routes(client)).resolves.toEqual(0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = capturedBody as any;
      // Raw path should be sent as-is (not escaped to regex)
      expect(body.route.route.src).toBe('/about');
      // 'equals' syntax is sent directly to the API
      expect(body.route.srcSyntax).toBe('equals');
    });

    it('should send regex syntax for regex pattern', async () => {
      let capturedBody: unknown;

      client.scenario.get(
        '/v1/projects/:projectId/routes/versions',
        (_req, res) => {
          res.json({
            versions: [
              {
                id: 'live-version',
                isLive: true,
                isStaging: false,
                ruleCount: 0,
              },
            ],
          });
        }
      );

      client.scenario.post('/v1/projects/:projectId/routes', (req, res) => {
        capturedBody = req.body;
        res.json({
          route: {
            id: 'new-route-id',
            name: 'Regex Route',
            enabled: true,
            staged: true,
            route: req.body.route.route,
          },
          version: {
            id: 'new-staging',
            isStaging: true,
            ruleCount: 1,
            alias: 'test.vercel.app',
          },
        });
      });

      client.setArgv(
        'routes',
        'add',
        'Regex Route',
        '--src',
        '^/api/(.*)$',
        '--action',
        'rewrite',
        '--dest',
        '/handler/$1',
        '--yes'
      );

      await expect(routes(client)).resolves.toEqual(0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = capturedBody as any;
      // Regex pattern sent as-is
      expect(body.route.route.src).toBe('^/api/(.*)$');
      // Default syntax is regex
      expect(body.route.srcSyntax).toBe('regex');
    });
  });

  describe('edge cases', () => {
    it('should allow route name "add"', async () => {
      // Ensure that "add" can be used as a route name without being
      // confused with the subcommand
      let capturedBody: unknown;

      client.scenario.get(
        '/v1/projects/:projectId/routes/versions',
        (_req, res) => {
          res.json({
            versions: [
              {
                id: 'live-version',
                isLive: true,
                isStaging: false,
                ruleCount: 0,
              },
            ],
          });
        }
      );

      client.scenario.post('/v1/projects/:projectId/routes', (req, res) => {
        capturedBody = req.body;
        res.json({
          route: {
            id: 'new-route-id',
            name: 'add',
            enabled: true,
            staged: true,
            route: req.body.route.route,
          },
          version: {
            id: 'new-staging',
            isStaging: true,
            ruleCount: 1,
            alias: 'test.vercel.app',
          },
        });
      });

      client.setArgv(
        'routes',
        'add',
        'add', // This is the route NAME, not the subcommand
        '--src',
        '/test',
        '--action',
        'rewrite',
        '--dest',
        '/handler',
        '--yes'
      );

      await expect(routes(client)).resolves.toEqual(0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = capturedBody as any;
      // The route name should be "add", not undefined
      expect(body.route.name).toBe('add');
      // Default syntax is regex, so /test becomes the regex source
      expect(body.route.route.src).toContain('test');
      expect(body.route.route.dest).toBe('/handler');
    });
  });
});
