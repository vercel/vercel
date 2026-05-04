import * as RR from 'react-router';
import * as build_ from 'virtual:react-router/server-build';
const build = build_.default || build_;

const DATA_SUFFIX = '.data';
const SPLAT_SEGMENT = '*';
const SPLAT_ROUTES_PARAM = '_routes';

function parseRequestedRouteIds(value) {
  if (!value) return [];
  return value
    .split(',')
    .map(segment => segment.trim())
    .filter(Boolean);
}

function getSplatRouteIds(routesById) {
  const ids = new Set();
  for (const route of Object.values(routesById ?? {})) {
    if (route?.path?.includes(SPLAT_SEGMENT)) {
      ids.add(route.id);
    }
  }
  return ids;
}

function buildRouteTree(routesById) {
  const nodesById = new Map();
  for (const route of Object.values(routesById ?? {})) {
    nodesById.set(route.id, {
      id: route.id,
      path: route.path,
      index: route.index,
      caseSensitive: route.caseSensitive,
      children: [],
    });
  }

  const roots = [];
  for (const route of Object.values(routesById ?? {})) {
    const node = nodesById.get(route.id);
    if (!node) continue;
    if (route.parentId) {
      const parent = nodesById.get(route.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function getFallbackRouteId(pathnameWithoutSuffix, routeTree, splatRouteIds) {
  const matches = RR.matchRoutes(routeTree, pathnameWithoutSuffix);
  if (!matches?.length) {
    return null;
  }

  for (let i = matches.length - 1; i >= 0; i--) {
    const id = matches[i]?.route?.id;
    if (id && !splatRouteIds.has(id)) {
      return id;
    }
  }
  return null;
}

function normalizeDataRequestRoutes(request, routeTree, splatRouteIds) {
  const url = new URL(request.url);
  if (!url.pathname.endsWith(DATA_SUFFIX)) {
    return request;
  }

  const requestedIds = parseRequestedRouteIds(
    url.searchParams.get(SPLAT_ROUTES_PARAM)
  );
  if (
    !requestedIds.length ||
    !requestedIds.every(id => splatRouteIds.has(id))
  ) {
    return request;
  }

  const pathnameWithoutSuffix =
    url.pathname.slice(0, -DATA_SUFFIX.length) || '/';
  const fallbackRouteId = getFallbackRouteId(
    pathnameWithoutSuffix,
    routeTree,
    splatRouteIds
  );
  if (!fallbackRouteId || requestedIds.includes(fallbackRouteId)) {
    return request;
  }

  url.searchParams.set(SPLAT_ROUTES_PARAM, fallbackRouteId);
  return new Request(url, request);
}

// A custom server entrypoint exports a Web API-compatible handler function.
// Otherwise, assume the default export is the React Router app manifest.
export default typeof build === 'function'
  ? // A custom server entrypoint is expected to export
    // a Web API-compatible handler function
    build
  : // Otherwise, assume the default export is
    // the React Router app manifest
    (() => {
      const handler = RR.createRequestHandler(build);
      const routeTree = buildRouteTree(build.routes);
      const splatRouteIds = getSplatRouteIds(build.routes);

      // RouterContextProvider is only available in 7.9.0+
      // wrap the handler to provide a RouterContextProvider
      // if we're using the v8 middleware
      return request => {
        const normalizedRequest = normalizeDataRequestRoutes(
          request,
          routeTree,
          splatRouteIds
        );
        return build.future.v8_middleware
          ? handler(normalizedRequest, new RR.RouterContextProvider())
          : handler(normalizedRequest);
      };
    })();
