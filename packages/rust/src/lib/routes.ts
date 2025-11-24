const CatchPriority = {
  Static: 0,
  Dynamic: 1,
  CatchAll: 2,
  OptionalCatchAll: 2,
};

interface Route {
  src: string;
  dest: string;
  path: string;
}

interface ParsedRoute {
  src: string;
  dest: string;
  path: string;
  depth: number;
  catchType: (typeof CatchPriority)[keyof typeof CatchPriority] | null;
}

export function parseRoute(filepath: string): ParsedRoute {
  const route = filepath.endsWith('.rs') ? filepath.slice(0, -3) : filepath;
  const segments = route.split('/');
  const result = segments.reduce<{
    catchType: null | number;
    src: string[];
    searchParams: URLSearchParams;
  }>(
    (acc, segment) => {
      // Catch all route
      if (segment.startsWith('[...') && segment.endsWith(']')) {
        acc.catchType = CatchPriority.CatchAll;
        acc.src.push('(\\S+)');
        return acc;
      }

      // Optional catch all route
      if (segment.startsWith('[[...') && segment.endsWith(']]')) {
        acc.catchType = CatchPriority.OptionalCatchAll;
        acc.src.push('(/\\S+)?');
        return acc;
      }

      // Dynamic route
      if (segment.startsWith('[') && segment.endsWith(']')) {
        const parameterName = segment.replace('[', '').replace(']', '');
        acc.catchType = CatchPriority.Dynamic;
        acc.src.push(`(?<${parameterName}>[^/]+)`);
        acc.searchParams.set(parameterName, `$${parameterName}`);
        return acc;
      }

      // Static routes do not need adding to `routes`.
      acc.catchType = CatchPriority.Static;
      acc.src.push(segment);

      return acc;
    },
    {
      catchType: null,
      src: [],
      searchParams: new URLSearchParams(),
    }
  );

  const searchParams = decodeURIComponent(result.searchParams.toString());
  const queryString = searchParams !== '' ? `?${searchParams}` : '';

  return {
    src: `/${result.src.join('/')}`,
    dest: `/${route}${queryString}`,
    path: route,
    depth: segments.length,
    catchType: result.catchType,
  };
}

export function generateRoutes(files: string[]): Route[] {
  const routes = files
    .map(file => {
      return parseRoute(file);
    })
    .filter(r => r.src !== '/api/main');

  const orderedRoutes = routes.sort((a, b) => {
    // First sort by catchType ascending
    if (a.catchType !== b.catchType) {
      // Handle null values - null should come first (lowest priority)
      if (a.catchType === null) return -1;
      if (b.catchType === null) return 1;
      return a.catchType - b.catchType;
    }

    // Then sort by depth descending (higher depth first)
    return b.depth - a.depth;
  });

  return orderedRoutes.map<Route>(r => ({
    src: r.src,
    dest: r.dest,
    path: r.path,
  }));
}
