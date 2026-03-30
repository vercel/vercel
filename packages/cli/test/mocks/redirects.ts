import { client } from './client';

function createRedirect(index: number) {
  return {
    id: `redirect-${index}`,
    source: `/old-path-${index}`,
    destination: `/new-path-${index}`,
    permanent: index % 2 === 0,
    statusCode: index % 2 === 0 ? 308 : 307,
    createdAt: Date.now() - index * 1000,
    updatedAt: Date.now(),
  };
}

function createRedirectVersion(
  index: number,
  type: 'live' | 'staging' | 'previous' = 'previous'
) {
  const now = Date.now();
  return {
    id: `version-${index}`,
    lastModified: now - index * 60000, // Each version is 1 minute older
    createdBy: `user${index}@example.com`,
    name: index === 0 && type !== 'previous' ? undefined : `Version ${index}`,
    isLive: type === 'live',
    isStaging: type === 'staging',
    redirectCount: 10 + index,
  };
}

export function useRedirects(
  count: number = 3,
  withPagination: boolean = false
) {
  client.scenario.get('/v1/bulk-redirects', (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 50;
    const search = req.query.q as string;

    let redirects = Array.from({ length: count }, (_, i) => createRedirect(i));

    // Filter by search if provided
    if (search) {
      redirects = redirects.filter(
        r => r.source.includes(search) || r.destination.includes(search)
      );
    }

    const response: any = {
      redirects,
    };

    if (withPagination) {
      const totalPages = Math.ceil(count / perPage);
      response.pagination = {
        count: redirects.length,
        numPages: totalPages,
        page: page,
      };
    }

    res.json(response);
  });
}

export function useRedirectVersions(count: number = 5) {
  client.scenario.get('/v1/bulk-redirects/versions', (_req, res) => {
    const versions = [];

    // Create versions with different states
    if (count >= 1) {
      versions.push(createRedirectVersion(0, 'staging'));
    }
    if (count >= 2) {
      versions.push(createRedirectVersion(1, 'live'));
    }

    // Add remaining as previous versions
    for (let i = 2; i < count; i++) {
      versions.push(createRedirectVersion(i, 'previous'));
    }

    res.json({ versions });
  });
}
