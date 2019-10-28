export * from './schemas';
export * from './types';
import {
  Route,
  Handler,
  NormalizedRoutes,
  GetRoutesProps,
  NowError,
} from './types';
import {
  convertCleanUrls,
  convertRewrites,
  convertRedirects,
  convertHeaders,
  convertTrailingSlash,
} from './superstatic';

export function isHandler(route: Route): route is Handler {
  return typeof (route as Handler).handle !== 'undefined';
}

export function normalizeRoutes(inputRoutes: Route[] | null): NormalizedRoutes {
  if (!inputRoutes || inputRoutes.length === 0) {
    return { routes: inputRoutes, error: null };
  }

  const routes: Route[] = [];
  const handling: string[] = [];
  const errors = [];

  // We don't want to treat the input routes as references
  inputRoutes.forEach(r => routes.push(Object.assign({}, r)));

  for (const route of routes) {
    if (isHandler(route)) {
      // typeof { handle: string }
      if (Object.keys(route).length !== 1) {
        errors.push({
          message: `Cannot have any other keys when handle is used (handle: ${route.handle})`,
          handle: route.handle,
        });
      }
      if (!['filesystem'].includes(route.handle)) {
        errors.push({
          message: `This is not a valid handler (handle: ${route.handle})`,
          handle: route.handle,
        });
      }
      if (handling.includes(route.handle)) {
        errors.push({
          message: `You can only handle something once (handle: ${route.handle})`,
          handle: route.handle,
        });
      } else {
        handling.push(route.handle);
      }
    } else if (route.src) {
      // Route src should always start with a '^'
      if (!route.src.startsWith('^')) {
        route.src = `^${route.src}`;
      }

      // Route src should always end with a '$'
      if (!route.src.endsWith('$')) {
        route.src = `${route.src}$`;
      }

      // Route src should strip escaped forward slash, its not special
      route.src = route.src.replace(/\\\//g, '/');

      try {
        // This feels a bit dangerous if there would be a vulnerability in RegExp.
        new RegExp(route.src);
      } catch (err) {
        errors.push({
          message: `Invalid regular expression: "${route.src}"`,
          src: route.src,
        });
      }
    } else {
      errors.push({
        message: 'A route must set either handle or src',
      });
    }
  }

  const error: NowError | null =
    errors.length > 0
      ? {
          code: 'invalid_routes',
          message: `One or more invalid routes were found: \n${JSON.stringify(
            errors,
            null,
            2
          )}`,
          errors,
        }
      : null;

  return { routes, error };
}

export function getTransformedRoutes({
  nowConfig,
  filePaths,
}: GetRoutesProps): NormalizedRoutes {
  const { cleanUrls, rewrites, redirects, headers, trailingSlash } = nowConfig;
  let { routes } = nowConfig;
  const errors: { message: string }[] = [];
  if (routes) {
    if (typeof cleanUrls !== 'undefined') {
      errors.push({
        message: 'Cannot define both `routes` and `cleanUrls`',
      });
    }
    if (typeof trailingSlash !== 'undefined') {
      errors.push({
        message: 'Cannot define both `routes` and `trailingSlash`',
      });
    }
    if (typeof redirects !== 'undefined') {
      errors.push({
        message: 'Cannot define both `routes` and `redirects`',
      });
    }
    if (typeof headers !== 'undefined') {
      errors.push({
        message: 'Cannot define both `routes` and `headers`',
      });
    }
    if (typeof rewrites !== 'undefined') {
      errors.push({
        message: 'Cannot define both `routes` and `rewrites`',
      });
    }
  } else {
    routes = [];
    if (cleanUrls) {
      const clean = convertCleanUrls(filePaths);
      routes.push(...clean.redirects);
    }
    if (typeof trailingSlash !== 'undefined') {
      routes.push(...convertTrailingSlash(trailingSlash));
    }
    if (typeof redirects !== 'undefined') {
      routes.push(...convertRedirects(redirects));
    }
    if (typeof headers !== 'undefined') {
      routes.push(...convertHeaders(headers));
    }
    if (typeof rewrites !== 'undefined') {
      routes.push({ handle: 'filesystem' });
      routes.push(...convertRewrites(rewrites));
    }
  }

  if (errors.length > 0) {
    const error = {
      code: 'invalid_routes',
      message: `One or more invalid routes were found: \n${JSON.stringify(
        errors,
        null,
        2
      )}`,
      errors,
    };
    return { routes: [], error };
  }

  return normalizeRoutes(routes);
}
