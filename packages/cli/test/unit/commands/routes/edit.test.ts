import { describe, it, expect, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import {
  useEditRoute,
  useEditRouteComprehensive,
  useEditRouteWithApiError,
  capturedBodies,
} from '../../../mocks/routes';
import routes from '../../../../src/commands/routes';

describe('routes edit', () => {
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
    // Reset captured bodies
    capturedBodies.edit = undefined;
  });

  it('should show help with --help flag', async () => {
    client.setArgv('routes', 'edit', '--help');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(2);
  });

  it('should error when no args provided', async () => {
    useEditRoute();
    client.setArgv('routes', 'edit');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
  });

  it('should error when route not found', async () => {
    useEditRoute();
    client.setArgv('routes', 'edit', 'nonexistent', '--name', 'New Name');
    const exitCode = await routes(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('No route found');
  });

  // ---------------------------------------------------------------------------
  // Metadata edits
  // ---------------------------------------------------------------------------

  describe('metadata changes', () => {
    it('should change route name', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--name',
        'New API Proxy'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('Updated');

      const body = capturedBodies.edit as any;
      expect(body.route.name).toBe('New API Proxy');
      // Everything else should be preserved
      expect(body.route.route.dest).toBe('https://api.example.com/:path*');
    });

    it('should change route description', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--description',
        'Updated proxy description'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.description).toBe('Updated proxy description');
    });

    it('should clear description with empty string', async () => {
      useEditRouteComprehensive();
      client.setArgv('routes', 'edit', 'API Rewrite', '--description', '');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.description).toBeUndefined();
    });

    it('should error when name is too long', async () => {
      useEditRouteComprehensive();
      const longName = 'a'.repeat(257);
      client.setArgv('routes', 'edit', 'API Rewrite', '--name', longName);
      const exitCode = await routes(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('256 characters or less');
    });
  });

  // ---------------------------------------------------------------------------
  // Source pattern edits
  // ---------------------------------------------------------------------------

  describe('source pattern changes', () => {
    it('should change source pattern', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--src',
        '/v2/api/:path*'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.src).toBe('/v2/api/:path*');
    });

    it('should change source syntax', async () => {
      useEditRouteComprehensive();
      client.setArgv('routes', 'edit', 'API Rewrite', '--src-syntax', 'regex');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.srcSyntax).toBe('regex');
    });

    it('should change both source and syntax together', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'Blog Redirect',
        '--src',
        '/old-blog',
        '--src-syntax',
        'equals'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.src).toBe('/old-blog');
      expect(body.route.srcSyntax).toBe('equals');
    });

    it('should error on invalid syntax', async () => {
      useEditRouteComprehensive();
      client.setArgv('routes', 'edit', 'API Rewrite', '--src-syntax', 'glob');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid syntax');
    });
  });

  // ---------------------------------------------------------------------------
  // Primary action changes (rewrite, redirect, set-status)
  // ---------------------------------------------------------------------------

  describe('primary action changes', () => {
    it('should change rewrite destination', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--dest',
        'https://new-api.example.com/:path*'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.dest).toBe('https://new-api.example.com/:path*');
      // Status should not appear (was a rewrite, stays a rewrite)
      expect(body.route.route.status).toBeUndefined();
    });

    it('should change redirect destination while keeping status', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'Blog Redirect',
        '--dest',
        '/new-articles'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.dest).toBe('/new-articles');
      expect(body.route.route.status).toBe(301); // preserved
    });

    it('should change redirect status code', async () => {
      useEditRouteComprehensive();
      client.setArgv('routes', 'edit', 'Blog Redirect', '--status', '308');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.status).toBe(308);
      expect(body.route.route.dest).toBe('/articles'); // preserved
    });

    it('should switch from rewrite to redirect', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--action',
        'redirect',
        '--dest',
        '/new-api',
        '--status',
        '301'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.dest).toBe('/new-api');
      expect(body.route.route.status).toBe(301);
    });

    it('should switch from redirect to rewrite', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'Blog Redirect',
        '--action',
        'rewrite',
        '--dest',
        '/articles-page'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.dest).toBe('/articles-page');
      // Status should be removed when switching to rewrite
      expect(body.route.route.status).toBeUndefined();
    });

    it('should switch from redirect to set-status', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'Blog Redirect',
        '--action',
        'set-status',
        '--status',
        '410'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      // Dest should be removed when switching to set-status
      expect(body.route.route.dest).toBeUndefined();
      expect(body.route.route.status).toBe(410);
    });

    it('should switch from set-status to rewrite', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'Block Admin',
        '--action',
        'rewrite',
        '--dest',
        '/admin-panel'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.dest).toBe('/admin-panel');
      // Status should be removed
      expect(body.route.route.status).toBeUndefined();
    });

    it('should remove destination with --no-dest', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--no-dest',
        '--action',
        'set-status',
        '--status',
        '503'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.dest).toBeUndefined();
      expect(body.route.route.status).toBe(503);
    });

    it('should remove status with --no-status', async () => {
      useEditRouteComprehensive();
      client.setArgv('routes', 'edit', 'Blog Redirect', '--no-status');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.status).toBeUndefined();
      // Dest is preserved
      expect(body.route.route.dest).toBe('/articles');
    });
  });

  // ---------------------------------------------------------------------------
  // Response header edits
  // ---------------------------------------------------------------------------

  describe('response header changes', () => {
    it('should add a new response header to existing headers', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--set-response-header',
        'X-New-Header=new-value'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      // Original headers should be preserved
      expect(body.route.route.headers['Cache-Control']).toBe('no-cache');
      expect(body.route.route.headers['X-Custom']).toBe('value');
      // New header should be added
      expect(body.route.route.headers['X-New-Header']).toBe('new-value');
    });

    it('should overwrite an existing response header', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--set-response-header',
        'Cache-Control=public, max-age=3600'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.headers['Cache-Control']).toBe(
        'public, max-age=3600'
      );
      // Other headers preserved
      expect(body.route.route.headers['X-Custom']).toBe('value');
    });

    it('should clear all response headers', async () => {
      useEditRouteComprehensive();
      client.setArgv('routes', 'edit', 'API Rewrite', '--clear-headers');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(Object.keys(body.route.route.headers)).toHaveLength(0);
    });

    it('should clear headers then add new ones', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--clear-headers',
        '--set-response-header',
        'X-Only-Header=only'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.headers).toEqual({ 'X-Only-Header': 'only' });
    });
  });

  // ---------------------------------------------------------------------------
  // Transform edits (request headers, request query)
  // ---------------------------------------------------------------------------

  describe('transform changes', () => {
    it('should add a request header transform to existing transforms', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--set-request-header',
        'X-New=new'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      const transforms = body.route.route.transforms;
      // Original 4 transforms + 1 new
      expect(transforms.length).toBeGreaterThanOrEqual(5);
      const newTransform = transforms.find(
        (t: any) =>
          t.type === 'request.headers' &&
          t.op === 'set' &&
          t.target.key === 'X-New'
      );
      expect(newTransform).toBeDefined();
      expect(newTransform.args).toBe('new');
    });

    it('should add a request query transform', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--delete-request-query',
        'utm_source'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      const transforms = body.route.route.transforms;
      const deleteTransform = transforms.find(
        (t: any) =>
          t.type === 'request.query' &&
          t.op === 'delete' &&
          t.target.key === 'utm_source'
      );
      expect(deleteTransform).toBeDefined();
    });

    it('should add an append response header transform', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--append-response-header',
        'Set-Cookie=session=abc'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      const transforms = body.route.route.transforms;
      const appendTransform = transforms.find(
        (t: any) =>
          t.type === 'response.headers' &&
          t.op === 'append' &&
          t.target.key === 'Set-Cookie'
      );
      expect(appendTransform).toBeDefined();
    });

    it('should clear all transforms', async () => {
      useEditRouteComprehensive();
      client.setArgv('routes', 'edit', 'API Rewrite', '--clear-transforms');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.transforms).toHaveLength(0);
    });

    it('should clear transforms then add new ones', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--clear-transforms',
        '--set-request-header',
        'X-Only=only'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.transforms).toHaveLength(1);
      expect(body.route.route.transforms[0].target.key).toBe('X-Only');
    });
  });

  // ---------------------------------------------------------------------------
  // Condition edits
  // ---------------------------------------------------------------------------

  describe('condition changes', () => {
    it('should add a has condition to existing conditions', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--has',
        'query:version:2'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      // Original 2 has conditions + 1 new
      expect(body.route.route.has).toHaveLength(3);
      const newCond = body.route.route.has.find(
        (c: any) => c.type === 'query' && c.key === 'version'
      );
      expect(newCond).toBeDefined();
    });

    it('should add a missing condition to existing conditions', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--missing',
        'cookie:banned'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      // Original 1 missing condition + 1 new
      expect(body.route.route.missing).toHaveLength(2);
    });

    it('should clear all conditions', async () => {
      useEditRouteComprehensive();
      client.setArgv('routes', 'edit', 'API Rewrite', '--clear-conditions');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.has).toHaveLength(0);
      expect(body.route.route.missing).toHaveLength(0);
    });

    it('should clear conditions and add new ones', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--clear-conditions',
        '--has',
        'header:X-API-Key'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.has).toHaveLength(1);
      expect(body.route.route.has[0].key).toBe('X-API-Key');
      expect(body.route.route.missing).toHaveLength(0);
    });

    it('should add a host condition', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'Blog Redirect',
        '--has',
        'host:blog.example.com'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.has).toHaveLength(1);
      expect(body.route.route.has[0].type).toBe('host');
    });
  });

  // ---------------------------------------------------------------------------
  // continue field recomputation
  // ---------------------------------------------------------------------------

  describe('continue field', () => {
    it('should set continue:true when adding response headers to a route without them', async () => {
      useEditRouteComprehensive();
      // Blog Redirect has no headers/transforms, so adding headers should set continue
      // But it has status 301 (redirect/terminating), so continue should NOT be set
      client.setArgv(
        'routes',
        'edit',
        'Blog Redirect',
        '--set-response-header',
        'X-Test=test'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      // Redirect is terminating, so continue should NOT be set even with headers
      expect(body.route.route.continue).toBeUndefined();
    });

    it('should preserve continue:true for header-only route edits', async () => {
      useEditRouteComprehensive();
      // CORS Headers is header-only with continue:true
      client.setArgv(
        'routes',
        'edit',
        'CORS Headers',
        '--set-response-header',
        'X-Frame-Options=DENY'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.continue).toBe(true);
    });

    it('should remove continue when switching from header-only to set-status', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'CORS Headers',
        '--action',
        'set-status',
        '--status',
        '204',
        '--clear-headers'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      // set-status is terminating, continue should not be set
      expect(body.route.route.continue).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Combined feature edits
  // ---------------------------------------------------------------------------

  describe('combined changes', () => {
    it('should change name, dest, and add header in one command', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--name',
        'Updated Proxy',
        '--dest',
        'https://v2.api.example.com/:path*',
        '--set-response-header',
        'X-Version=2'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.name).toBe('Updated Proxy');
      expect(body.route.route.dest).toBe('https://v2.api.example.com/:path*');
      expect(body.route.route.headers['X-Version']).toBe('2');
      // Original headers preserved
      expect(body.route.route.headers['Cache-Control']).toBe('no-cache');
    });

    it('should switch action type and clear transforms simultaneously', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--action',
        'set-status',
        '--status',
        '503',
        '--clear-transforms'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.dest).toBeUndefined();
      expect(body.route.route.status).toBe(503);
      expect(body.route.route.transforms).toHaveLength(0);
    });

    it('should clear everything and rebuild minimal route', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--clear-conditions',
        '--clear-headers',
        '--clear-transforms',
        '--action',
        'redirect',
        '--dest',
        '/gone',
        '--status',
        '301'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.route.has).toHaveLength(0);
      expect(body.route.route.missing).toHaveLength(0);
      expect(Object.keys(body.route.route.headers)).toHaveLength(0);
      expect(body.route.route.transforms).toHaveLength(0);
      expect(body.route.route.dest).toBe('/gone');
      expect(body.route.route.status).toBe(301);
    });
  });

  // ---------------------------------------------------------------------------
  // Validation errors
  // ---------------------------------------------------------------------------

  describe('validation errors', () => {
    it('should error when --action redirect without --dest', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'Block Admin',
        '--action',
        'redirect',
        '--status',
        '301'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires --dest');
    });

    it('should error when --action rewrite without --dest', async () => {
      useEditRouteComprehensive();
      client.setArgv('routes', 'edit', 'Block Admin', '--action', 'rewrite');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires --dest');
    });

    it('should error when --action set-status without --status', async () => {
      useEditRouteComprehensive();
      client.setArgv('routes', 'edit', 'API Rewrite', '--action', 'set-status');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('requires --status');
    });

    it('should error on invalid action type', async () => {
      useEditRouteComprehensive();
      client.setArgv('routes', 'edit', 'API Rewrite', '--action', 'foobar');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid action type');
    });

    it('should error when redirect status is not valid', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'API Rewrite',
        '--action',
        'redirect',
        '--dest',
        '/new',
        '--status',
        '404'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid redirect status');
    });

    it('should error on invalid condition format', async () => {
      useEditRouteComprehensive();
      client.setArgv('routes', 'edit', 'API Rewrite', '--has', 'invalid');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid condition');
    });
  });

  // ---------------------------------------------------------------------------
  // No changes detection
  // ---------------------------------------------------------------------------

  describe('no changes', () => {
    it('should report no changes when setting dest to same value', async () => {
      useEditRouteComprehensive();
      // Setting dest to the same value it already has → no actual change
      client.setArgv('routes', 'edit', 'Blog Redirect', '--dest', '/articles');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('No changes made');
    });
  });

  // ---------------------------------------------------------------------------
  // API error handling
  // ---------------------------------------------------------------------------

  describe('API errors', () => {
    it('should handle feature_not_enabled error', async () => {
      useEditRouteWithApiError();
      client.setArgv('routes', 'edit', 'Test Route', '--name', 'New Name');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('not enabled');
    });
  });

  // ---------------------------------------------------------------------------
  // Preservation of existing data
  // ---------------------------------------------------------------------------

  describe('data preservation', () => {
    it('should preserve existing conditions when only changing name', async () => {
      useEditRouteComprehensive();
      client.setArgv('routes', 'edit', 'API Rewrite', '--name', 'Renamed');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      // Conditions should be preserved
      expect(body.route.route.has).toHaveLength(2);
      expect(body.route.route.missing).toHaveLength(1);
    });

    it('should preserve existing transforms when only changing dest', async () => {
      useEditRouteComprehensive();
      client.setArgv('routes', 'edit', 'API Rewrite', '--dest', '/new');
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      // Original 4 transforms should be preserved
      expect(body.route.route.transforms).toHaveLength(4);
    });

    it('should preserve enabled state when editing other fields', async () => {
      useEditRouteComprehensive();
      // Block Admin is disabled (enabled: false)
      client.setArgv(
        'routes',
        'edit',
        'Block Admin',
        '--description',
        'Updated'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.enabled).toBe(false); // preserved
    });

    it('should preserve srcSyntax when editing other fields', async () => {
      useEditRouteComprehensive();
      client.setArgv(
        'routes',
        'edit',
        'Blog Redirect',
        '--dest',
        '/new-articles'
      );
      const exitCode = await routes(client);
      expect(exitCode).toEqual(0);

      const body = capturedBodies.edit as any;
      expect(body.route.srcSyntax).toBe('equals'); // preserved
    });
  });
});
