import {
  mergeServicesRoutes,
  type BuilderEntry,
} from '../src/services/merge-services-routes';
import type { ResolvedService } from '../src/services/types';

describe('mergeServicesRoutes', () => {
  it('should exclude prefixed paths from root catch-all', () => {
    const services: ResolvedService[] = [
      {
        name: 'web',
        type: 'web',
        workspace: 'apps/web',
        routePrefix: '/',
        builder: { use: '@vercel/next', src: 'apps/web' },
      },
      {
        name: 'admin',
        type: 'web',
        workspace: 'apps/admin',
        routePrefix: '/admin',
        framework: 'vite',
        builder: {
          use: '@vercel/static-build',
          src: 'apps/admin/package.json',
        },
      },
      {
        name: 'docs',
        type: 'web',
        workspace: 'apps/docs',
        routePrefix: '/docs',
        framework: 'docusaurus-2',
        builder: { use: '@vercel/static-build', src: 'apps/docs/package.json' },
      },
    ];

    const builders: BuilderEntry[] = [
      {
        src: 'apps/web',
        use: '@vercel/next',
        config: { routePrefix: '/' },
        result: {
          routes: [
            { handle: 'filesystem' },
            { src: '^/(.*)$', dest: '/apps/web/package.json', check: true },
          ],
        },
      },
      {
        src: 'apps/admin/package.json',
        use: '@vercel/static-build',
        config: { routePrefix: '/admin', framework: 'vite' },
        result: {
          routes: [],
        },
      },
      {
        src: 'apps/docs/package.json',
        use: '@vercel/static-build',
        config: { routePrefix: '/docs', framework: 'docusaurus-2' },
        result: {
          routes: [],
        },
      },
    ];

    const result = mergeServicesRoutes({ services, builders });

    // Root catch-all should exclude admin and docs prefixes
    const catchAllRoute = result.routes.find(
      r => 'src' in r && r.src?.includes('(?!')
    );
    expect(catchAllRoute).toBeDefined();
    expect(catchAllRoute).toMatchObject({
      src: '^/(?!(?:admin|docs)(?:/|$))(.*)$',
      dest: '/apps/web/package.json',
      check: true,
    });

    // Admin SPA fallback should be present
    const adminFallback = result.routes.find(
      r => 'src' in r && r.src === '^/admin(?:/(.*))?$'
    );
    expect(adminFallback).toBeDefined();
    expect(adminFallback).toMatchObject({
      src: '^/admin(?:/(.*))?$',
      dest: '/admin/index.html',
    });

    // Docs should have framework-specific routes (from getDefaultRoutesForPrefix)
    const docs404 = result.routes.find(
      r => 'src' in r && r.src === '^/docs/.*' && 'status' in r
    );
    expect(docs404).toBeDefined();
  });

  it('should order routes correctly', () => {
    const services: ResolvedService[] = [
      {
        name: 'web',
        type: 'web',
        workspace: 'apps/web',
        routePrefix: '/',
        builder: { use: '@vercel/next', src: 'apps/web' },
      },
      {
        name: 'admin',
        type: 'web',
        workspace: 'apps/admin',
        routePrefix: '/admin',
        framework: 'vite',
        builder: {
          use: '@vercel/static-build',
          src: 'apps/admin/package.json',
        },
      },
    ];

    const builders: BuilderEntry[] = [
      {
        src: 'apps/web',
        use: '@vercel/next',
        config: { routePrefix: '/' },
        result: {
          routes: [
            { src: '/header', headers: { 'x-test': 'value' }, continue: true },
            { handle: 'filesystem' },
            { src: '^/(.*)$', dest: '/apps/web/package.json', check: true },
          ],
        },
      },
      {
        src: 'apps/admin/package.json',
        use: '@vercel/static-build',
        config: { routePrefix: '/admin', framework: 'vite' },
        result: {
          routes: [],
        },
      },
    ];

    const result = mergeServicesRoutes({ services, builders });

    // Find indices
    const continueIndex = result.routes.findIndex(
      r => 'continue' in r && r.continue === true
    );
    const filesystemIndex = result.routes.findIndex(
      r => 'handle' in r && r.handle === 'filesystem'
    );
    const adminFallbackIndex = result.routes.findIndex(
      r => 'src' in r && r.src === '^/admin(?:/(.*))?$'
    );
    const catchAllIndex = result.routes.findIndex(
      r => 'src' in r && r.src?.includes('(?!')
    );

    // Continue routes should come first
    expect(continueIndex).toBeLessThan(filesystemIndex);

    // Admin fallback should come before catch-all
    expect(adminFallbackIndex).toBeLessThan(catchAllIndex);
  });

  it('should not modify catch-all when no prefixed services', () => {
    const services: ResolvedService[] = [
      {
        name: 'web',
        type: 'web',
        workspace: 'apps/web',
        routePrefix: '/',
        builder: { use: '@vercel/next', src: 'apps/web' },
      },
    ];

    const builders: BuilderEntry[] = [
      {
        src: 'apps/web',
        use: '@vercel/next',
        config: { routePrefix: '/' },
        result: {
          routes: [
            { handle: 'filesystem' },
            { src: '^/(.*)$', dest: '/apps/web/package.json', check: true },
          ],
        },
      },
    ];

    const result = mergeServicesRoutes({ services, builders });

    // Catch-all should remain unchanged
    const catchAllRoute = result.routes.find(
      r => 'src' in r && r.src === '^/(.*)$'
    );
    expect(catchAllRoute).toBeDefined();
    expect(catchAllRoute).toMatchObject({
      src: '^/(.*)$',
      dest: '/apps/web/package.json',
      check: true,
    });
  });
});
