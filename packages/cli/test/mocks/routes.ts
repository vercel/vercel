import { client } from './client';

function createRoute(index: number) {
  return {
    id: `route-${index}`,
    name: `Route ${index}`,
    description: `Description for route ${index}`,
    enabled: index % 3 !== 0, // Every 3rd route is disabled
    staged: index % 5 === 1, // Every 5th route (starting at 1) is staged
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
        lastModified: Date.now() - 86400000,
        createdBy: 'user@example.com',
        isLive: true,
        isStaging: false,
        ruleCount: 10,
      });
      res.json({ versions });
    }
  );

  // Mock the add route endpoint with validation
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

    // Validate required fields
    if (!body.route) {
      res.status(400).json({ error: { message: 'route is required' } });
      return;
    }

    if (!body.route.name) {
      res.status(400).json({ error: { message: 'route.name is required' } });
      return;
    }

    if (body.route.name.length > 256) {
      res.status(400).json({
        error: { message: 'route.name must be 256 characters or less' },
      });
      return;
    }

    if (!body.route.route) {
      res.status(400).json({ error: { message: 'route.route is required' } });
      return;
    }

    if (!body.route.route.src) {
      res
        .status(400)
        .json({ error: { message: 'route.route.src is required' } });
      return;
    }

    if (body.route.description && body.route.description.length > 1024) {
      res.status(400).json({
        error: { message: 'route.description must be 1024 characters or less' },
      });
      return;
    }

    // Validate conditions limit
    const hasCount = body.route.route.has?.length ?? 0;
    const missingCount = body.route.route.missing?.length ?? 0;
    if (hasCount + missingCount > 16) {
      res.status(400).json({
        error: { message: 'Maximum 16 conditions allowed (has + missing)' },
      });
      return;
    }

    // Validate position if provided
    if (body.position) {
      const { placement, referenceId } = body.position;
      if ((placement === 'after' || placement === 'before') && !referenceId) {
        res.status(400).json({
          error: { message: `position.referenceId required for ${placement}` },
        });
        return;
      }
    }

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

export function useUpdateRouteVersion(options?: {
  versions?: Array<{
    id: string;
    isLive?: boolean;
    isStaging?: boolean;
    ruleCount?: number;
  }>;
}) {
  // Default versions: staging, live, and one previous
  const defaultVersions = [
    {
      id: 'staging-version',
      isStaging: true,
      isLive: false,
      ruleCount: 5,
    },
    {
      id: 'live-version',
      isStaging: false,
      isLive: true,
      ruleCount: 3,
    },
    {
      id: 'previous-version',
      isStaging: false,
      isLive: false,
      ruleCount: 2,
    },
  ];

  const versions = (options?.versions ?? defaultVersions).map((v, i) => ({
    id: v.id,
    lastModified: Date.now() - i * 60000,
    createdBy: 'user@example.com',
    isStaging: v.isStaging ?? false,
    isLive: v.isLive ?? false,
    ruleCount: v.ruleCount ?? 5,
    alias: v.isStaging ? 'test-routes-staging.vercel.app' : undefined,
  }));

  // Mock get versions
  client.scenario.get(
    '/v1/projects/:projectId/routes/versions',
    (_req, res) => {
      res.json({ versions });
    }
  );

  // Mock update version (promote/restore/discard)
  client.scenario.post(
    '/v1/projects/:projectId/routes/versions',
    (req, res) => {
      const body = req.body as { id: string; action: string };

      const version = versions.find(v => v.id === body.id);
      if (!version) {
        res.status(404).json({ error: { message: 'Version not found' } });
        return;
      }

      if (body.action === 'promote') {
        if (version.isLive) {
          res
            .status(400)
            .json({ error: { message: 'Version is already live' } });
          return;
        }
        if (!version.isStaging) {
          res.status(400).json({
            error: { message: 'Only staging versions can be promoted' },
          });
          return;
        }
      }

      if (body.action === 'restore') {
        if (version.isLive) {
          res.status(400).json({
            error: { message: 'Cannot restore the live version' },
          });
          return;
        }
        if (version.isStaging) {
          res.status(400).json({
            error: { message: 'Cannot restore a staging version' },
          });
          return;
        }
      }

      if (body.action === 'discard') {
        if (!version.isStaging) {
          res.status(400).json({
            error: { message: 'Only staging versions can be discarded' },
          });
          return;
        }
      }

      res.json({
        version: {
          id: version.id,
          lastModified: Date.now(),
          createdBy: version.createdBy,
          isLive: body.action === 'promote' || body.action === 'restore',
          isStaging: false,
          ruleCount: version.ruleCount,
        },
      });
    }
  );
}

export function useRoutesWithDiffForPublish() {
  // Routes with diff info including reorder
  client.scenario.get('/v1/projects/:projectId/routes', (req, res) => {
    const diff = req.query.diff === 'true';

    const routes = [
      {
        ...createRoute(0),
        name: 'Added route',
        action: diff ? ('+' as const) : undefined,
        routeType: 'rewrite' as const,
      },
      {
        ...createRoute(1),
        name: 'Deleted route',
        action: diff ? ('-' as const) : undefined,
        routeType: 'redirect' as const,
      },
      {
        ...createRoute(2),
        name: 'Modified route',
        action: diff ? ('~' as const) : undefined,
        routeType: 'transform' as const,
      },
      {
        ...createRoute(3),
        name: 'Reordered route',
        action: diff ? ('~' as const) : undefined,
        previousIndex: diff ? 5 : undefined,
        newIndex: diff ? 3 : undefined,
        routeType: 'transform' as const,
      },
      {
        ...createRoute(4),
        name: 'Enabled route',
        enabled: true,
        action: diff ? ('~' as const) : undefined,
        previousEnabled: diff ? false : undefined,
        routeType: 'rewrite' as const,
      },
      {
        ...createRoute(5),
        name: 'Disabled route',
        enabled: false,
        action: diff ? ('~' as const) : undefined,
        previousEnabled: diff ? true : undefined,
        routeType: 'redirect' as const,
      },
      { ...createRoute(6), name: 'Unchanged route', action: undefined },
    ];

    res.json({
      routes,
      version: {
        id: 'staging-version',
        lastModified: Date.now(),
        createdBy: 'user@example.com',
        isStaging: true,
        ruleCount: routes.length,
        alias: 'test-routes-staging.vercel.app',
      },
    });
  });
}

export function useDeleteRoute() {
  // Return 4 routes that can be deleted
  const routes = [
    { ...createRoute(0), name: 'Route A', id: 'route-a-id' },
    { ...createRoute(1), name: 'Route B', id: 'route-b-id' },
    { ...createRoute(2), name: 'Route C', id: 'route-c-id' },
    { ...createRoute(3), name: 'Route D', id: 'route-d-id', enabled: false },
  ];

  client.scenario.get('/v1/projects/:projectId/routes', (_req, res) => {
    res.json({
      routes,
      version: {
        id: 'live-version',
        lastModified: Date.now(),
        createdBy: 'user@example.com',
        isLive: true,
        ruleCount: routes.length,
      },
    });
  });

  client.scenario.get(
    '/v1/projects/:projectId/routes/versions',
    (_req, res) => {
      res.json({
        versions: [
          {
            id: 'staging-version',
            isLive: false,
            isStaging: true,
            ruleCount: routes.length,
          },
          {
            id: 'live-version',
            isLive: true,
            isStaging: false,
            ruleCount: routes.length,
          },
        ],
      });
    }
  );

  client.scenario.delete('/v1/projects/:projectId/routes', (req, res) => {
    const body = req.body as { routeIds: string[] };

    // Validate all IDs exist
    const missing = body.routeIds.filter(id => !routes.find(r => r.id === id));
    if (missing.length > 0) {
      res.status(400).json({
        error: { message: `Routes not found: ${missing.join(', ')}` },
      });
      return;
    }

    res.json({
      deletedCount: body.routeIds.length,
      version: {
        id: 'new-staging-version',
        lastModified: Date.now(),
        createdBy: 'user@example.com',
        isStaging: true,
        isLive: false,
        ruleCount: routes.length - body.routeIds.length,
      },
    });
  });
}

export function useEditRoute() {
  const routes = [
    {
      ...createRoute(0),
      name: 'Enabled Route',
      id: 'enabled-route-id',
      enabled: true,
    },
    {
      ...createRoute(1),
      name: 'Disabled Route',
      id: 'disabled-route-id',
      enabled: false,
    },
  ];

  client.scenario.get('/v1/projects/:projectId/routes', (_req, res) => {
    res.json({
      routes,
      version: {
        id: 'live-version',
        lastModified: Date.now(),
        createdBy: 'user@example.com',
        isLive: true,
        ruleCount: routes.length,
      },
    });
  });

  client.scenario.get(
    '/v1/projects/:projectId/routes/versions',
    (_req, res) => {
      res.json({
        versions: [
          {
            id: 'staging-version',
            isLive: false,
            isStaging: true,
            ruleCount: routes.length,
          },
          {
            id: 'live-version',
            isLive: true,
            isStaging: false,
            ruleCount: routes.length,
          },
        ],
      });
    }
  );

  client.scenario.patch(
    '/v1/projects/:projectId/routes/:routeId',
    (req, res) => {
      const body = req.body as { route?: { enabled?: boolean; name?: string } };

      res.json({
        route: {
          id: req.params.routeId,
          name: body.route?.name ?? 'Updated Route',
          enabled: body.route?.enabled ?? true,
          staged: true,
          route: { src: '^/test$' },
        },
        version: {
          id: 'new-staging-version',
          lastModified: Date.now(),
          createdBy: 'user@example.com',
          isStaging: true,
          isLive: false,
          ruleCount: routes.length,
        },
      });
    }
  );
}

export function useStageRoutes() {
  const routes = [
    { ...createRoute(0), name: 'Route 1', id: 'route-1-id' },
    { ...createRoute(1), name: 'Route 2', id: 'route-2-id' },
    { ...createRoute(2), name: 'Route 3', id: 'route-3-id' },
    { ...createRoute(3), name: 'Route 4', id: 'route-4-id' },
  ];

  client.scenario.get('/v1/projects/:projectId/routes', (_req, res) => {
    res.json({
      routes,
      version: {
        id: 'live-version',
        lastModified: Date.now(),
        createdBy: 'user@example.com',
        isLive: true,
        ruleCount: routes.length,
      },
    });
  });

  client.scenario.get(
    '/v1/projects/:projectId/routes/versions',
    (_req, res) => {
      res.json({
        versions: [
          {
            id: 'staging-version',
            isLive: false,
            isStaging: true,
            ruleCount: routes.length,
          },
          {
            id: 'live-version',
            isLive: true,
            isStaging: false,
            ruleCount: routes.length,
          },
        ],
      });
    }
  );

  client.scenario.put('/v1/projects/:projectId/routes', (_req, res) => {
    res.json({
      version: {
        id: 'new-staging-version',
        lastModified: Date.now(),
        createdBy: 'user@example.com',
        isStaging: true,
        isLive: false,
        ruleCount: routes.length,
      },
    });
  });
}

export function useRoutesForInspect() {
  const detailedRoutes = [
    {
      id: 'route-redirect-123',
      name: 'Old page redirect',
      description: 'Redirects old page to new location',
      enabled: true,
      staged: false,
      srcSyntax: 'equals',
      route: {
        src: '/old-page',
        dest: '/new-page',
        status: 308,
      },
      routeType: 'redirect',
    },
    {
      id: 'route-header-456',
      name: 'Custom headers',
      description: 'Add custom headers to all requests',
      enabled: false,
      staged: true,
      srcSyntax: 'path-to-regexp',
      route: {
        src: '/api/:path*',
        headers: {
          'X-Custom-Header': 'custom-value',
          'Cache-Control': 'no-cache',
        },
        continue: true,
      },
      routeType: 'transform',
    },
    {
      id: 'route-condition-789',
      name: 'Auth protected',
      description: 'Requires auth cookie',
      enabled: true,
      staged: false,
      srcSyntax: 'regex',
      route: {
        src: '^/protected$',
        dest: '/login',
        missing: [{ type: 'cookie', key: 'auth' }],
        has: [{ type: 'header', key: 'Accept', value: 'text/html' }],
      },
      routeType: 'rewrite',
    },
    {
      id: 'route-transform-101',
      name: 'API transforms',
      description: 'Transform request headers and query for API',
      enabled: true,
      staged: true,
      srcSyntax: 'path-to-regexp',
      route: {
        src: '/api/:version/users/:id',
        dest: '/internal-api/$1/users/$2',
        transforms: [
          {
            type: 'request.headers',
            op: 'set',
            target: { key: 'X-Forwarded-Host' },
            args: 'api.example.com',
          },
          {
            type: 'request.query',
            op: 'delete',
            target: { key: 'debug' },
          },
          {
            type: 'response.headers',
            op: 'append',
            target: { key: 'Vary' },
            args: 'Accept',
          },
        ],
      },
      routeType: 'rewrite',
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
        lastModified: Date.now(),
        createdBy: 'user@example.com',
        isLive: true,
        ruleCount: routes.length,
      },
    });
  });
}

export function useRoutesForInspectDiff() {
  const stagingRoutes = [
    {
      id: 'route-diff-1',
      name: 'API Proxy',
      description: 'Updated proxy description',
      enabled: true,
      staged: true,
      srcSyntax: 'path-to-regexp',
      route: {
        src: '/api/:path*',
        dest: 'https://v2.api.example.com/:path*',
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'X-New-Header': 'added',
        },
        has: [
          { type: 'header', key: 'Authorization' },
          { type: 'query', key: 'version', value: '2' },
        ],
      },
      routeType: 'rewrite',
    },
    {
      id: 'route-diff-new',
      name: 'New Route',
      enabled: true,
      staged: true,
      srcSyntax: 'equals',
      route: {
        src: '/new-page',
        dest: '/new-handler',
      },
      routeType: 'rewrite',
    },
  ];

  const productionRoutes = [
    {
      id: 'route-diff-1',
      name: 'API Proxy',
      description: 'Proxies API requests',
      enabled: true,
      staged: false,
      srcSyntax: 'path-to-regexp',
      route: {
        src: '/api/:path*',
        dest: 'https://api.example.com/:path*',
        headers: {
          'Cache-Control': 'no-cache',
          'X-Old-Header': 'removed',
        },
        has: [{ type: 'header', key: 'Authorization' }],
      },
      routeType: 'rewrite',
    },
  ];

  client.scenario.get('/v1/projects/:projectId/routes', (req, res) => {
    const versionId = req.query.versionId as string;
    const search = req.query.q as string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let routes: any[] =
      versionId === 'prod-version-id'
        ? [...productionRoutes]
        : [...stagingRoutes];

    if (search) {
      const query = search.toLowerCase();
      routes = routes.filter(
        (r: any) =>
          r.name.toLowerCase().includes(query) ||
          r.id.toLowerCase().includes(query)
      );
    }

    res.json({
      routes,
      version: {
        id:
          versionId === 'prod-version-id'
            ? 'prod-version-id'
            : 'staging-version-id',
        lastModified: Date.now(),
        createdBy: 'user@example.com',
        isLive: versionId === 'prod-version-id',
        isStaging: versionId !== 'prod-version-id',
        ruleCount: routes.length,
      },
    });
  });

  client.scenario.get(
    '/v1/projects/:projectId/routes/versions',
    (_req, res) => {
      res.json({
        versions: [
          {
            id: 'staging-version-id',
            isLive: false,
            isStaging: true,
            ruleCount: stagingRoutes.length,
          },
          {
            id: 'prod-version-id',
            isLive: true,
            isStaging: false,
            ruleCount: productionRoutes.length,
          },
        ],
      });
    }
  );
}
