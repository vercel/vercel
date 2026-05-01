import { Route, MergeRoutesProps, Build } from './types';
import { isHandler, HandleValue } from './index';

const ZERO_CONFIG_ROUTES_BUILDER = '@vercel/zero-config-routes';
const INDEX_HTML_FALLBACK_ROUTE_KEYS = new Set(['src', 'dest']);

interface BuilderToRoute {
  [use: string]: Route[];
}

interface BuilderRoutes {
  [entrypoint: string]: BuilderToRoute;
}

interface BuilderRoute {
  route: Route;
  use: string;
}

function getBuilderRoutesMapping(builds: Build[]) {
  const builderRoutes: BuilderRoutes = {};
  for (const { entrypoint, routes, use } of builds) {
    if (routes) {
      if (!builderRoutes[entrypoint]) {
        builderRoutes[entrypoint] = {};
      }
      builderRoutes[entrypoint][use] = routes;
    }
  }
  return builderRoutes;
}

function isIndexHtmlFallback({ route, use }: BuilderRoute): boolean {
  return (
    use === ZERO_CONFIG_ROUTES_BUILDER &&
    !isHandler(route) &&
    Object.keys(route).every(key => INDEX_HTML_FALLBACK_ROUTE_KEYS.has(key)) &&
    typeof route.src === 'string' &&
    typeof route.dest === 'string' &&
    (route.dest === 'index.html' || route.dest.endsWith('/index.html'))
  );
}

function getCheckAndContinue(routes: BuilderRoute[]): {
  checks: Route[];
  continues: Route[];
  others: Route[];
  fallbacks: Route[];
} {
  const checks: Route[] = [];
  const continues: Route[] = [];
  const others: Route[] = [];
  const fallbacks: Route[] = [];

  for (const builderRoute of routes) {
    const { route } = builderRoute;
    if (isHandler(route)) {
      // Should never happen, only here to make TS happy
      throw new Error(
        `Unexpected route found in getCheckAndContinue(): ${JSON.stringify(
          route
        )}`
      );
    } else if (route.check && !route.override) {
      checks.push(route);
    } else if (route.continue && !route.override) {
      continues.push(route);
    } else if (isIndexHtmlFallback(builderRoute)) {
      fallbacks.push(route);
    } else {
      others.push(route);
    }
  }
  return { checks, continues, others, fallbacks };
}

export function mergeRoutes({ userRoutes, builds }: MergeRoutesProps): Route[] {
  const userHandleMap = new Map<HandleValue | null, Route[]>();
  let userPrevHandle: HandleValue | null = null;
  (userRoutes || []).forEach(route => {
    if (isHandler(route)) {
      userPrevHandle = route.handle;
    } else {
      const routes = userHandleMap.get(userPrevHandle);
      if (!routes) {
        userHandleMap.set(userPrevHandle, [route]);
      } else {
        routes.push(route);
      }
    }
  });

  const builderHandleMap = new Map<HandleValue | null, BuilderRoute[]>();
  const builderRoutes = getBuilderRoutesMapping(builds);
  const sortedPaths = Object.keys(builderRoutes).sort();
  sortedPaths.forEach(path => {
    const br = builderRoutes[path];
    const sortedBuilders = Object.keys(br).sort();
    sortedBuilders.forEach(use => {
      let builderPrevHandle: HandleValue | null = null;
      br[use].forEach(route => {
        if (isHandler(route)) {
          builderPrevHandle = route.handle;
        } else {
          const routes = builderHandleMap.get(builderPrevHandle);
          if (!routes) {
            builderHandleMap.set(builderPrevHandle, [{ route, use }]);
          } else {
            routes.push({ route, use });
          }
        }
      });
    });
  });

  const outputRoutes: Route[] = [];
  const uniqueHandleValues = new Set([
    null,
    ...userHandleMap.keys(),
    ...builderHandleMap.keys(),
  ]);
  for (const handle of uniqueHandleValues) {
    const userRoutes = userHandleMap.get(handle) || [];
    const builderRoutes = builderHandleMap.get(handle) || [];
    const builderSorted = getCheckAndContinue(builderRoutes);
    if (
      handle !== null &&
      (userRoutes.length > 0 || builderRoutes.length > 0)
    ) {
      outputRoutes.push({ handle });
    }
    outputRoutes.push(...builderSorted.continues);
    outputRoutes.push(...userRoutes);
    outputRoutes.push(...builderSorted.checks);
    outputRoutes.push(...builderSorted.others);
    outputRoutes.push(...builderSorted.fallbacks);
  }
  return outputRoutes;
}
