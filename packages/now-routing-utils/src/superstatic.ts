/**
 * This converts Superstatic configuration to vercel.json Routes
 * See https://github.com/firebase/superstatic#configuration
 */
import { parse as parseUrl, format as formatUrl } from 'url';
import { pathToRegexp, compile, Key } from 'path-to-regexp';
import { Route, NowRedirect, NowRewrite, NowHeader } from './types';

const UN_NAMED_SEGMENT = '__UN_NAMED_SEGMENT__';

export function getCleanUrls(
  filePaths: string[]
): { html: string; clean: string }[] {
  const htmlFiles = filePaths
    .map(toRoute)
    .filter(f => f.endsWith('.html'))
    .map(f => ({
      html: f,
      clean: f.slice(0, -5),
    }));

  return htmlFiles;
}

export function convertCleanUrls(
  cleanUrls: boolean,
  trailingSlash?: boolean,
  status = 308
): Route[] {
  const routes: Route[] = [];
  if (cleanUrls) {
    const loc = trailingSlash ? '/$1/' : '/$1';
    routes.push({
      src: '^/(?:(.+)/)?index(?:\\.html)?/?$',
      headers: { Location: loc },
      status,
    });
    routes.push({
      src: '^/(.*)\\.html/?$',
      headers: { Location: loc },
      status,
    });
  }
  return routes;
}

export function convertRedirects(
  redirects: NowRedirect[],
  defaultStatus = 308
): Route[] {
  return redirects.map(r => {
    const { src, segments } = sourceToRegex(r.source);
    try {
      const loc = replaceSegments(segments, r.destination, true);
      let status: number;
      if (typeof r.permanent === 'boolean') {
        status = r.permanent ? 308 : 307;
      } else if (r.statusCode) {
        status = r.statusCode;
      } else {
        status = defaultStatus;
      }
      const route: Route = {
        src,
        headers: { Location: loc },
        status,
      };
      return route;
    } catch (e) {
      throw new Error(`Failed to parse redirect: ${JSON.stringify(r)}`);
    }
  });
}

export function convertRewrites(rewrites: NowRewrite[]): Route[] {
  return rewrites.map(r => {
    const { src, segments } = sourceToRegex(r.source);
    try {
      const dest = replaceSegments(segments, r.destination);
      const route: Route = { src, dest, check: true };
      return route;
    } catch (e) {
      throw new Error(`Failed to parse rewrite: ${JSON.stringify(r)}`);
    }
  });
}

export function convertHeaders(headers: NowHeader[]): Route[] {
  return headers.map(h => {
    const obj: { [key: string]: string } = {};
    const { src, segments } = sourceToRegex(h.source);
    const namedSegments = segments.filter(name => name !== UN_NAMED_SEGMENT);
    const indexes: { [k: string]: string } = {};

    segments.forEach((name, index) => {
      indexes[name] = toSegmentDest(index);
    });

    h.headers.forEach(({ key, value }) => {
      if (namedSegments.length > 0) {
        if (key.includes(':')) {
          key = safelyCompile(key, indexes);
        }
        if (value.includes(':')) {
          value = safelyCompile(value, indexes);
        }
      }
      obj[key] = value;
    });
    const route: Route = {
      src,
      headers: obj,
      continue: true,
    };
    return route;
  });
}

export function convertTrailingSlash(enable: boolean, status = 308): Route[] {
  const routes: Route[] = [];
  if (enable) {
    routes.push({
      src: '^/\\.well-known(?:/.*)?$'
    });
    routes.push({
      src: '^/((?:[^/]+/)*[^/\\.]+)$',
      headers: { Location: '/$1/' },
      status,
    });
    routes.push({
      src: '^/((?:[^/]+/)*[^/]+\\.\\w+)/$',
      headers: { Location: '/$1' },
      status,
    });
  } else {
    routes.push({
      src: '^/(.*)\\/$',
      headers: { Location: '/$1' },
      status,
    });
  }
  return routes;
}

export function sourceToRegex(
  source: string
): { src: string; segments: string[] } {
  const keys: Key[] = [];
  const r = pathToRegexp(source, keys, {
    strict: true,
    sensitive: true,
    delimiter: '/',
  });
  const segments = keys
    .map(k => k.name)
    .map(name => {
      if (typeof name !== 'string') {
        return UN_NAMED_SEGMENT;
      }
      return name;
    });
  return { src: r.source, segments };
}

function replaceSegments(
  segments: string[],
  destination: string,
  isRedirect?: boolean
): string {
  const parsedDestination = parseUrl(destination, true);
  delete parsedDestination.href;
  delete parsedDestination.path;
  delete parsedDestination.search;
  // eslint-disable-next-line prefer-const
  let { pathname, hash, query, ...rest } = parsedDestination;
  pathname = pathname || '';
  hash = hash || '';

  const namedSegments = segments.filter(name => name !== UN_NAMED_SEGMENT);

  if (namedSegments.length > 0) {
    const indexes: { [k: string]: string } = {};
    segments.forEach((name, index) => {
      indexes[name] = toSegmentDest(index);
    });

    let destParams = new Set<string>();

    if (destination.includes(':') && segments.length > 0) {
      const pathnameKeys: Key[] = [];
      const hashKeys: Key[] = [];

      try {
        pathToRegexp(pathname, pathnameKeys);
        pathToRegexp(hash || '', hashKeys);
      } catch (_) {
        // this is not fatal so don't error when failing to parse the
        // params from the destination
      }

      destParams = new Set(
        [...pathnameKeys, ...hashKeys]
          .map(key => key.name)
          .filter(val => typeof val === 'string') as string[]
      );

      pathname = safelyCompile(pathname, indexes, true);
      hash = hash ? safelyCompile(hash, indexes, true) : null;

      for (const [key, strOrArray] of Object.entries(query)) {
        let value = Array.isArray(strOrArray) ? strOrArray[0] : strOrArray;
        if (value) {
          value = safelyCompile(value, indexes, true);
        }
        query[key] = value;
      }
    }

    // We only add path segments to redirect queries if manually
    // specified and only automatically add them for rewrites if one
    // or more params aren't already used in the destination's path
    const paramKeys = Object.keys(indexes);

    if (!isRedirect && !paramKeys.some(param => destParams.has(param))) {
      for (const param of paramKeys) {
        if (!(param in query) && param !== UN_NAMED_SEGMENT) {
          query[param] = indexes[param];
        }
      }
    }

    destination = formatUrl({
      ...rest,
      pathname,
      query,
      hash,
    });

    // url.format() escapes the dollar sign but it must be preserved for now-proxy
    destination = destination.replace(/%24/g, '$');
  }

  return destination;
}

function safelyCompile(
  value: string,
  indexes: { [k: string]: string },
  attemptDirectCompile?: boolean
): string {
  if (!value) {
    return value;
  }

  if (attemptDirectCompile) {
    try {
      // Attempt compiling normally with path-to-regexp first and fall back
      // to safely compiling to handle edge cases if path-to-regexp compile
      // fails
      return compile(value, { validate: false })(indexes);
    } catch (e) {
      // non-fatal, we continue to safely compile
    }
  }

  for (const key of Object.keys(indexes)) {
    if (value.includes(`:${key}`)) {
      value = value
        .replace(
          new RegExp(`:${key}\\*`, 'g'),
          `:${key}--ESCAPED_PARAM_ASTERISK`
        )
        .replace(
          new RegExp(`:${key}\\?`, 'g'),
          `:${key}--ESCAPED_PARAM_QUESTION`
        )
        .replace(new RegExp(`:${key}\\+`, 'g'), `:${key}--ESCAPED_PARAM_PLUS`)
        .replace(
          new RegExp(`:${key}(?!\\w)`, 'g'),
          `--ESCAPED_PARAM_COLON${key}`
        );
    }
  }
  value = value
    .replace(/(:|\*|\?|\+|\(|\)|\{|\})/g, '\\$1')
    .replace(/--ESCAPED_PARAM_PLUS/g, '+')
    .replace(/--ESCAPED_PARAM_COLON/g, ':')
    .replace(/--ESCAPED_PARAM_QUESTION/g, '?')
    .replace(/--ESCAPED_PARAM_ASTERISK/g, '*');

  // the value needs to start with a forward-slash to be compiled
  // correctly
  return compile(`/${value}`, { validate: false })(indexes).substr(1);
}

function toSegmentDest(index: number): string {
  const i = index + 1; // js is base 0, regex is base 1
  return '$' + i.toString();
}

function toRoute(filePath: string): string {
  return filePath.startsWith('/') ? filePath : '/' + filePath;
}
