import { parse as parseUrl } from 'url';
export * from './schemas';
export * from './types';
import {
  Route,
  Handler,
  NormalizedRoutes,
  GetRoutesProps,
  RouteApiError,
  NowRedirect,
} from './types';
import {
  convertCleanUrls,
  convertRewrites,
  convertRedirects,
  convertHeaders,
  convertTrailingSlash,
  sourceToRegex,
} from './superstatic';

export { getCleanUrls } from './superstatic';
export { mergeRoutes } from './merge';
export { appendRoutesToPhase } from './append';

const VALID_HANDLE_VALUES = [
  'filesystem',
  'hit',
  'miss',
  'rewrite',
  'error',
  'resource',
] as const;
const validHandleValues = new Set<string>(VALID_HANDLE_VALUES);
export type HandleValue = typeof VALID_HANDLE_VALUES[number];

export function isHandler(route: Route): route is Handler {
  return typeof (route as Handler).handle !== 'undefined';
}

export function isValidHandleValue(handle: string): handle is HandleValue {
  return validHandleValues.has(handle);
}

export function normalizeRoutes(inputRoutes: Route[] | null): NormalizedRoutes {
  if (!inputRoutes || inputRoutes.length === 0) {
    return { routes: inputRoutes, error: null };
  }

  const routes: Route[] = [];
  const handling: HandleValue[] = [];
  const errors: string[] = [];

  inputRoutes.forEach((r, i) => {
    const route = { ...r };
    routes.push(route);
    const keys = Object.keys(route);
    if (isHandler(route)) {
      const { handle } = route;
      if (keys.length !== 1) {
        const unknownProp = keys.find(prop => prop !== 'handle');
        errors.push(
          `Route at index ${i} has unknown property \`${unknownProp}\`.`
        );
      } else if (!isValidHandleValue(handle)) {
        errors.push(
          `Route at index ${i} has unknown handle value \`handle: ${handle}\`.`
        );
      } else if (handling.includes(handle)) {
        errors.push(
          `Route at index ${i} is a duplicate. Please use one \`handle: ${handle}\` at most.`
        );
      } else {
        handling.push(handle);
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

      const regError = checkRegexSyntax('Route', i, route.src);
      if (regError) {
        errors.push(regError);
      }

      // The last seen handling is the current handler
      const handleValue = handling[handling.length - 1];
      if (handleValue === 'hit') {
        if (route.dest) {
          errors.push(
            `Route at index ${i} cannot define \`dest\` after \`handle: hit\`.`
          );
        }
        if (route.status) {
          errors.push(
            `Route at index ${i} cannot define \`status\` after \`handle: hit\`.`
          );
        }
        if (!route.continue) {
          errors.push(
            `Route at index ${i} must define \`continue: true\` after \`handle: hit\`.`
          );
        }
      } else if (handleValue === 'miss') {
        if (route.dest && !route.check) {
          errors.push(
            `Route at index ${i} must define \`check: true\` after \`handle: miss\`.`
          );
        } else if (!route.dest && !route.continue) {
          errors.push(
            `Route at index ${i} must define \`continue: true\` after \`handle: miss\`.`
          );
        }
      }
    } else {
      errors.push(
        `Route at index ${i} must define either \`handle\` or \`src\` property.`
      );
    }
  });

  const error =
    errors.length > 0
      ? createError(
          'invalid_route',
          errors,
          'https://vercel.link/routes-json',
          'Learn More'
        )
      : null;
  return { routes, error };
}

type ErrorMessageType = 'Header' | 'Rewrite' | 'Redirect';

function checkRegexSyntax(
  type: ErrorMessageType | 'Route',
  index: number,
  src: string
): string | null {
  try {
    new RegExp(src);
  } catch (err) {
    const prop = type === 'Route' ? 'src' : 'source';
    return `${type} at index ${index} has invalid \`${prop}\` regular expression "${src}".`;
  }
  return null;
}

function checkPatternSyntax(
  type: ErrorMessageType,
  index: number,
  {
    source,
    destination,
  }: {
    source: string;
    destination?: string;
  }
): { message: string; link: string } | null {
  let sourceSegments = new Set<string>();
  const destinationSegments = new Set<string>();
  try {
    sourceSegments = new Set(sourceToRegex(source).segments);
  } catch (err) {
    return {
      message: `${type} at index ${index} has invalid \`source\` pattern "${source}".`,
      link: 'https://vercel.link/invalid-route-source-pattern',
    };
  }

  if (destination) {
    try {
      const { hostname, pathname, query } = parseUrl(destination, true);
      sourceToRegex(hostname || '').segments.forEach(name =>
        destinationSegments.add(name)
      );
      sourceToRegex(pathname || '').segments.forEach(name =>
        destinationSegments.add(name)
      );
      for (const strOrArray of Object.values(query)) {
        const value = Array.isArray(strOrArray) ? strOrArray[0] : strOrArray;
        sourceToRegex(value || '').segments.forEach(name =>
          destinationSegments.add(name)
        );
      }
    } catch (err) {
      // Since checkPatternSyntax() is a validation helper, we don't want to
      // replicate all possible URL parsing here so we consume the error.
      // If this really is an error, we'll throw later in convertRedirects().
    }

    for (const segment of destinationSegments) {
      if (!sourceSegments.has(segment)) {
        return {
          message: `${type} at index ${index} has segment ":${segment}" in \`destination\` property but not in \`source\` property.`,
          link: 'https://vercel.link/invalid-route-destination-segment',
        };
      }
    }
  }

  return null;
}

function checkRedirect(r: NowRedirect, index: number) {
  if (
    typeof r.permanent !== 'undefined' &&
    typeof r.statusCode !== 'undefined'
  ) {
    return `Redirect at index ${index} cannot define both \`permanent\` and \`statusCode\` properties.`;
  }
  return null;
}

function createError(
  code: string,
  allErrors: string | string[],
  link: string,
  action: string
): RouteApiError | null {
  const errors = Array.isArray(allErrors) ? allErrors : [allErrors];
  const message = errors[0];
  const error: RouteApiError = {
    name: 'RouteApiError',
    code,
    message,
    link,
    action,
    errors,
  };
  return error;
}

function notEmpty<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function getTransformedRoutes({
  nowConfig,
}: GetRoutesProps): NormalizedRoutes {
  const { cleanUrls, rewrites, redirects, headers, trailingSlash } = nowConfig;
  let { routes = null } = nowConfig;
  if (routes) {
    const hasNewProperties =
      typeof cleanUrls !== 'undefined' ||
      typeof trailingSlash !== 'undefined' ||
      typeof redirects !== 'undefined' ||
      typeof headers !== 'undefined' ||
      typeof rewrites !== 'undefined';

    if (hasNewProperties) {
      const error = createError(
        'invalid_mixed_routes',
        'If `rewrites`, `redirects`, `headers`, `cleanUrls` or `trailingSlash` are used, then `routes` cannot be present.',
        'https://vercel.link/mix-routing-props',
        'Learn More'
      );
      return { routes, error };
    }
    return normalizeRoutes(routes);
  }

  if (typeof cleanUrls !== 'undefined') {
    const normalized = normalizeRoutes(
      convertCleanUrls(cleanUrls, trailingSlash)
    );
    if (normalized.error) {
      normalized.error.code = 'invalid_clean_urls';
      return { routes, error: normalized.error };
    }
    routes = routes || [];
    routes.push(...(normalized.routes || []));
  }

  if (typeof trailingSlash !== 'undefined') {
    const normalized = normalizeRoutes(convertTrailingSlash(trailingSlash));
    if (normalized.error) {
      normalized.error.code = 'invalid_trailing_slash';
      return { routes, error: normalized.error };
    }
    routes = routes || [];
    routes.push(...(normalized.routes || []));
  }

  if (typeof redirects !== 'undefined') {
    const code = 'invalid_redirect';
    const regexErrorMessage = redirects
      .map((r, i) => checkRegexSyntax('Redirect', i, r.source))
      .find(notEmpty);
    if (regexErrorMessage) {
      return {
        routes,
        error: createError(
          'invalid_redirect',
          regexErrorMessage,
          'https://vercel.link/invalid-route-source-pattern',
          'Learn More'
        ),
      };
    }
    const patternError = redirects
      .map((r, i) => checkPatternSyntax('Redirect', i, r))
      .find(notEmpty);
    if (patternError) {
      return {
        routes,
        error: createError(
          code,
          patternError.message,
          patternError.link,
          'Learn More'
        ),
      };
    }
    const redirectErrorMessage = redirects.map(checkRedirect).find(notEmpty);
    if (redirectErrorMessage) {
      return {
        routes,
        error: createError(
          code,
          redirectErrorMessage,
          'https://vercel.link/redirects-json',
          'Learn More'
        ),
      };
    }
    const normalized = normalizeRoutes(convertRedirects(redirects));
    if (normalized.error) {
      normalized.error.code = code;
      return { routes, error: normalized.error };
    }
    routes = routes || [];
    routes.push(...(normalized.routes || []));
  }

  if (typeof headers !== 'undefined') {
    const code = 'invalid_header';
    const regexErrorMessage = headers
      .map((r, i) => checkRegexSyntax('Header', i, r.source))
      .find(notEmpty);
    if (regexErrorMessage) {
      return {
        routes,
        error: createError(
          code,
          regexErrorMessage,
          'https://vercel.link/invalid-route-source-pattern',
          'Learn More'
        ),
      };
    }
    const patternError = headers
      .map((r, i) => checkPatternSyntax('Header', i, r))
      .find(notEmpty);
    if (patternError) {
      return {
        routes,
        error: createError(
          code,
          patternError.message,
          patternError.link,
          'Learn More'
        ),
      };
    }
    const normalized = normalizeRoutes(convertHeaders(headers));
    if (normalized.error) {
      normalized.error.code = code;
      return { routes, error: normalized.error };
    }
    routes = routes || [];
    routes.push(...(normalized.routes || []));
  }

  if (typeof rewrites !== 'undefined') {
    const code = 'invalid_rewrite';
    const regexErrorMessage = rewrites
      .map((r, i) => checkRegexSyntax('Rewrite', i, r.source))
      .find(notEmpty);
    if (regexErrorMessage) {
      return {
        routes,
        error: createError(
          code,
          regexErrorMessage,
          'https://vercel.link/invalid-route-source-pattern',
          'Learn More'
        ),
      };
    }
    const patternError = rewrites
      .map((r, i) => checkPatternSyntax('Rewrite', i, r))
      .find(notEmpty);
    if (patternError) {
      return {
        routes,
        error: createError(
          code,
          patternError.message,
          patternError.link,
          'Learn More'
        ),
      };
    }
    const normalized = normalizeRoutes(convertRewrites(rewrites));
    if (normalized.error) {
      normalized.error.code = code;
      return { routes, error: normalized.error };
    }
    routes = routes || [];
    routes.push({ handle: 'filesystem' });
    routes.push(...(normalized.routes || []));
  }

  return { routes, error: null };
}
