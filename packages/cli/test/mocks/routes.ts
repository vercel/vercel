import { client } from './client';

function createRoute(index: number) {
  return {
    id: `route-${index}`,
    name: `Route ${index}`,
    description: `Description for route ${index}`,
    enabled: index % 3 !== 0, // Every 3rd route is disabled
    staged: false,
    route: {
      src: `/path-${index}/(.*)`,
      dest: `/dest-${index}/$1`,
      status: index % 2 === 0 ? undefined : 301,
      headers:
        index % 4 === 0 ? { 'Cache-Control': 'max-age=3600' } : undefined,
    },
  };
}

function createRouteVersion(
  index: number,
  type: 'live' | 'staging' | 'previous' = 'previous'
) {
  const now = Date.now();
  return {
    id: `version-${index}`,
    s3Key: `routes/version-${index}.json`,
    lastModified: now - index * 60000, // Each version is 1 minute older
    createdBy: `user${index}@example.com`,
    isLive: type === 'live',
    isStaging: type === 'staging',
    ruleCount: 10 + index,
    alias: type === 'staging' ? `test-routes-${index}.vercel.app` : undefined,
  };
}

export function useRoutes(count: number = 3) {
  client.scenario.get('/v1/projects/:projectId/routes', (req, res) => {
    const search = req.query.q as string;
    const filter = req.query.filter as string;

    let routes = Array.from({ length: count }, (_, i) => createRoute(i));

    // Filter by search if provided (matches API behavior: name, id, src, dest, description)
    if (search) {
      const query = search.toLowerCase();
      routes = routes.filter(
        r =>
          r.name.toLowerCase().includes(query) ||
          r.id.toLowerCase().includes(query) ||
          r.route.src.toLowerCase().includes(query) ||
          (r.route.dest && r.route.dest.toLowerCase().includes(query)) ||
          (r.description && r.description.toLowerCase().includes(query))
      );
    }

    // Filter by type if provided
    if (filter) {
      routes = routes.filter(r => {
        if (filter === 'header') return r.route.headers;
        if (filter === 'redirect')
          return (
            r.route.status && [301, 302, 307, 308].includes(r.route.status)
          );
        if (filter === 'rewrite') return r.route.dest && !r.route.status;
        return true;
      });
    }

    res.json({
      routes,
      version: {
        id: 'current-version',
        s3Key: 'routes/current.json',
        lastModified: Date.now(),
        createdBy: 'user@example.com',
        isLive: true,
        ruleCount: routes.length,
      },
    });
  });
}

export function useRouteVersions(count: number = 5) {
  client.scenario.get(
    '/v1/projects/:projectId/routes/versions',
    (_req, res) => {
      const versions = [];

      // Create versions with different states
      if (count >= 1) {
        versions.push(createRouteVersion(0, 'staging'));
      }
      if (count >= 2) {
        versions.push(createRouteVersion(1, 'live'));
      }

      // Add remaining as previous versions
      for (let i = 2; i < count; i++) {
        versions.push(createRouteVersion(i, 'previous'));
      }

      res.json({ versions });
    }
  );
}

export function useRoutesWithDiff() {
  client.scenario.get('/v1/projects/:projectId/routes', (req, res) => {
    const diff = req.query.diff === 'true';

    const routes = [
      { ...createRoute(0), action: diff ? '+' : undefined },
      { ...createRoute(1), action: diff ? '-' : undefined },
      { ...createRoute(2), action: diff ? '~' : undefined },
      { ...createRoute(3), action: undefined }, // unchanged
    ];

    res.json({
      routes,
      version: {
        id: 'staging-version',
        s3Key: 'routes/staging.json',
        lastModified: Date.now(),
        createdBy: 'user@example.com',
        isStaging: true,
        ruleCount: routes.length,
        alias: 'test-routes-staging.vercel.app',
      },
    });
  });
}

export function useAddRoute(options?: {
  hasStaging?: boolean;
  alias?: string;
}) {
  // Mock the versions endpoint to check for existing staging
  client.scenario.get(
    '/v1/projects/:projectId/routes/versions',
    (_req, res) => {
      const versions = [];
      if (options?.hasStaging) {
        versions.push({
          id: 'existing-staging',
          s3Key: 'routes/existing-staging.json',
          lastModified: Date.now(),
          createdBy: 'user@example.com',
          isStaging: true,
          isLive: false,
          ruleCount: 5,
          alias: 'existing-staging.vercel.app',
        });
      }
      versions.push({
        id: 'live-version',
        s3Key: 'routes/live.json',
        lastModified: Date.now() - 86400000,
        createdBy: 'user@example.com',
        isLive: true,
        isStaging: false,
        ruleCount: 10,
      });
      res.json({ versions });
    }
  );

  // Mock the add route endpoint
  client.scenario.post('/v1/projects/:projectId/routes', (req, res) => {
    const body = req.body as {
      route: {
        name: string;
        description?: string;
        enabled?: boolean;
        route: {
          src: string;
          dest?: string;
          status?: number;
          headers?: Record<string, string>;
          transforms?: unknown[];
          has?: unknown[];
          missing?: unknown[];
          continue?: boolean;
        };
      };
      position?: { placement: string; referenceId?: string };
    };

    res.json({
      route: {
        id: 'new-route-id',
        name: body.route.name,
        description: body.route.description,
        enabled: body.route.enabled !== false,
        staged: true,
        route: body.route.route,
      },
      version: {
        id: 'new-staging-version',
        s3Key: 'routes/new-staging.json',
        lastModified: Date.now(),
        createdBy: 'user@example.com',
        isStaging: true,
        isLive: false,
        ruleCount: 1,
        alias: options?.alias ?? 'test-routes.vercel.app',
      },
    });
  });
}

export function usePromoteRouteVersion() {
  client.scenario.post(
    '/v1/projects/:projectId/routes/versions',
    (_req, res) => {
      res.json({
        version: {
          id: 'promoted-version',
          s3Key: 'routes/promoted.json',
          lastModified: Date.now(),
          createdBy: 'user@example.com',
          isLive: true,
          isStaging: false,
          ruleCount: 1,
        },
      });
    }
  );
}

export function useRoutesForInspect() {
  const detailedRoutes = [
    {
      id: 'route-redirect-123',
      name: 'Old page redirect',
      description: 'Redirects old page to new location',
      enabled: true,
      staged: false,
      route: {
        src: '^/old-page$',
        dest: '/new-page',
        status: 308,
      },
    },
    {
      id: 'route-header-456',
      name: 'Custom headers',
      description: 'Add custom headers to all requests',
      enabled: false,
      staged: true,
      route: {
        src: '^/api/(.*)$',
        headers: {
          'X-Custom-Header': 'custom-value',
          'Cache-Control': 'no-cache',
        },
      },
    },
    {
      id: 'route-condition-789',
      name: 'Auth protected',
      description: 'Requires auth cookie',
      enabled: true,
      staged: false,
      route: {
        src: '^/protected$',
        dest: '/login',
        missing: [{ type: 'cookie', key: 'auth' }],
        has: [{ type: 'header', key: 'Accept', value: 'text/html' }],
      },
    },
  ];

  client.scenario.get('/v1/projects/:projectId/routes', (req, res) => {
    const search = req.query.q as string;

    let routes = [...detailedRoutes];

    if (search) {
      const query = search.toLowerCase();
      routes = routes.filter(
        r =>
          r.name.toLowerCase().includes(query) ||
          r.id.toLowerCase().includes(query) ||
          r.route.src.toLowerCase().includes(query) ||
          (r.description && r.description.toLowerCase().includes(query))
      );
    }

    res.json({
      routes,
      version: {
        id: 'current-version',
        s3Key: 'routes/current.json',
        lastModified: Date.now(),
        createdBy: 'user@example.com',
        isLive: true,
        ruleCount: routes.length,
      },
    });
  });
}
