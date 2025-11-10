import semver from 'semver';

/**
 * For a given page path, this function ensures that there is a leading slash.
 * If there is not a leading slash, one is added, otherwise it is noop.
 */
export function ensureLeadingSlash(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

function isGroupSegment(segment: string) {
  return segment[0] === '(' && segment.endsWith(')');
}

/**
 * Normalizes an app route so it represents the actual request path. Essentially
 * performing the following transformations:
 *
 * - `/(dashboard)/user/[id]/page` to `/user/[id]`
 * - `/(dashboard)/account/page` to `/account`
 * - `/user/[id]/page` to `/user/[id]`
 * - `/account/page` to `/account`
 * - `/page` to `/`
 * - `/(dashboard)/user/[id]/route` to `/user/[id]`
 * - `/(dashboard)/account/route` to `/account`
 * - `/user/[id]/route` to `/user/[id]`
 * - `/account/route` to `/account`
 * - `/route` to `/`
 * - `/` to `/`
 *
 * @param route the app route to normalize
 * @returns the normalized pathname
 */
function normalizeAppPath(route: string) {
  return ensureLeadingSlash(
    route.split('/').reduce((pathname, segment, index, segments) => {
      // Empty segments are ignored.
      if (!segment) {
        return pathname;
      }

      // Groups are ignored.
      if (isGroupSegment(segment)) {
        return pathname;
      }

      // Parallel segments are ignored.
      if (segment[0] === '@') {
        return pathname;
      }

      // The last segment (if it's a leaf) should be ignored.
      if (
        (segment === 'page' || segment === 'route') &&
        index === segments.length - 1
      ) {
        return pathname;
      }

      return `${pathname}/${segment}`;
    }, '')
  );
}

// order matters here, the first match will be used
const INTERCEPTION_ROUTE_MARKERS = [
  '(..)(..)',
  '(.)',
  '(..)',
  '(...)',
] as const;

function isInterceptionRouteAppPath(path: string): boolean {
  // TODO-APP: add more serious validation
  return path
    .split('/')
    .some(segment =>
      INTERCEPTION_ROUTE_MARKERS.some(m => segment.startsWith(m))
    );
}

type InterceptionRouteInformation = {
  /**
   * The intercepting route. This is the route that is being intercepted or the
   * route that the user was coming from. This is matched by the Next-Url
   * header.
   */
  interceptingRoute: string;

  /**
   * The intercepted route. This is the route that is being intercepted or the
   * route that the user is going to. This is matched by the request pathname.
   */
  interceptedRoute: string;
};

function extractInterceptionRouteInformation(
  path: string
): InterceptionRouteInformation {
  let interceptingRoute: string | undefined;
  let marker: (typeof INTERCEPTION_ROUTE_MARKERS)[number] | undefined;
  let interceptedRoute: string | undefined;

  for (const segment of path.split('/')) {
    marker = INTERCEPTION_ROUTE_MARKERS.find(m => segment.startsWith(m));
    if (marker) {
      [interceptingRoute, interceptedRoute] = path.split(marker, 2);
      break;
    }
  }

  if (!interceptingRoute || !marker || !interceptedRoute) {
    throw new Error(
      `Invalid interception route: ${path}. Must be in the format /<intercepting route>/(..|...|..)(..)/<intercepted route>`
    );
  }

  interceptingRoute = normalizeAppPath(interceptingRoute); // normalize the path, e.g. /(blog)/feed -> /feed

  switch (marker) {
    case '(.)':
      // (.) indicates that we should match with sibling routes, so we just need to append the intercepted route to the intercepting route
      if (interceptingRoute === '/') {
        interceptedRoute = `/${interceptedRoute}`;
      } else {
        interceptedRoute = interceptingRoute + '/' + interceptedRoute;
      }
      break;
    case '(..)':
      // (..) indicates that we should match at one level up, so we need to remove the last segment of the intercepting route
      if (interceptingRoute === '/') {
        throw new Error(
          `Invalid interception route: ${path}. Cannot use (..) marker at the root level, use (.) instead.`
        );
      }
      interceptedRoute = interceptingRoute
        .split('/')
        .slice(0, -1)
        .concat(interceptedRoute)
        .join('/');
      break;
    case '(...)':
      // (...) will match the route segment in the root directory, so we need to use the root directory to prepend the intercepted route
      interceptedRoute = '/' + interceptedRoute;
      break;
    case '(..)(..)': {
      // (..)(..) indicates that we should match at two levels up, so we need to remove the last two segments of the intercepting route

      const splitInterceptingRoute = interceptingRoute.split('/');
      if (splitInterceptingRoute.length <= 2) {
        throw new Error(
          `Invalid interception route: ${path}. Cannot use (..)(..) marker at the root level or one level up.`
        );
      }

      interceptedRoute = splitInterceptingRoute
        .slice(0, -2)
        .concat(interceptedRoute)
        .join('/');
      break;
    }
    default:
      throw new Error('Invariant: unexpected marker');
  }

  return { interceptingRoute, interceptedRoute };
}

// Identify /[param]/ in route string
// eslint-disable-next-line no-useless-escape
const TEST_DYNAMIC_ROUTE = /\/\[[^\/]+?\](?=\/|$)/;

export function isDynamicRoute(
  route: string,
  nextVersion: string | null
): boolean {
  // If the Next.js version is greater than or equal to 16.0.0, and the route is
  // an interception route, we need to extract the intercepted route. This is
  // gated on the version to ensure that we don't break existing behaviors for
  // older versions.
  const coerced = nextVersion ? semver.coerce(nextVersion) : null;
  if (
    coerced &&
    semver.gte(coerced, '16.0.0', {
      loose: true,
      includePrerelease: true,
    }) &&
    isInterceptionRouteAppPath(route)
  ) {
    route = extractInterceptionRouteInformation(route).interceptedRoute;
  }

  return TEST_DYNAMIC_ROUTE.test(ensureLeadingSlash(route));
}
