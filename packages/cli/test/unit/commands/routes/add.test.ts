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
        '--syntax',
        'path-to-regexp',
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
        '--syntax',
        'exact',
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
        '--syntax',
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
        '--syntax',
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
        '--syntax',
        'path-to-regexp',
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
        '--syntax',
        'path-to-regexp',
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
        '--syntax',
        'path-to-regexp',
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
        '--syntax',
        'path-to-regexp',
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
        '--syntax',
        'exact',
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
        '--syntax',
        'exact',
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
        '--syntax',
        'exact',
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
        '--syntax',
        'exact',
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
        '--dest',
        '/dest',
        '--yes'
      );
      const exitCode = await routes(client);

      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:add',
          value: 'add',
        },
      ]);
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

      client.setArgv('routes', 'add', 'My Route', '--dest', '/dest', '--yes');
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
        '--syntax',
        'invalid',
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

    it('should error when using --dest with non-redirect status', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/path',
        '--dest',
        '/dest',
        '--status',
        '404',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Cannot use --dest with status');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on invalid path-to-regexp pattern', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '/api/((invalid',
        '--syntax',
        'path-to-regexp',
        '--dest',
        '/dest',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Invalid path-to-regexp pattern');

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
        '--status',
        '99',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput(
        'Status code must be between 100 and 599'
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
        '--status',
        '600',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput(
        'Status code must be between 100 and 599'
      );

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

    it('should error on invalid regex pattern', async () => {
      useAddRoute();

      client.setArgv(
        'routes',
        'add',
        'My Route',
        '--src',
        '[invalid(regex',
        '--dest',
        '/dest',
        '--yes'
      );
      const exitCodePromise = routes(client);

      await expect(client.stderr).toOutput('Invalid regex pattern');

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
        '--syntax',
        'exact',
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
        '--syntax',
        'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'exact',
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
          '--syntax',
          'exact',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'exact',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
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
          '--syntax',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
          'path-to-regexp',
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
          '--syntax',
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
          '--syntax',
          'exact',
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
          '--syntax',
          'exact',
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
        '--dest',
        '/handler/$1',
        '--yes'
      );
      // Succeeds because the pattern is still valid regex
      // (just includes a literal " at the start)
      await expect(routes(client)).resolves.toEqual(0);
    });
  });
});
