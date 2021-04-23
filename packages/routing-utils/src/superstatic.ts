/**
 * This converts Superstatic configuration to vercel.json Routes
 * See https://github.com/firebase/superstatic#configuration
 */
import { parse as parseUrl, format as formatUrl } from 'url';
import { pathToRegexp, compile, Key } from 'path-to-regexp';
import { Route, Redirect, Rewrite, HasField, Header } from './types';
// @ts-ignore
import Lexer from 'regexr/lexer-dist/lexer';
// @ts-ignore
import lexerProfiles from 'regexr/lexer-dist/profiles';

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
  redirects: Redirect[],
  defaultStatus = 308
): Route[] {
  return redirects.map(r => {
    const { src, segments } = sourceToRegex(r.source);
    const hasSegments = collectHasSegments(r.has);
    try {
      const loc = replaceSegments(segments, hasSegments, r.destination, true);
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

      if (r.has) {
        route.has = r.has;
      }
      return route;
    } catch (e) {
      throw new Error(`Failed to parse redirect: ${JSON.stringify(r)}`);
    }
  });
}

export function convertRewrites(rewrites: Rewrite[]): Route[] {
  return rewrites.map(r => {
    const { src, segments } = sourceToRegex(r.source);
    const hasSegments = collectHasSegments(r.has);
    try {
      const dest = replaceSegments(segments, hasSegments, r.destination);
      const route: Route = { src, dest, check: true };

      if (r.has) {
        route.has = r.has;
      }
      return route;
    } catch (e) {
      throw new Error(`Failed to parse rewrite: ${JSON.stringify(r)}`);
    }
  });
}

export function convertHeaders(headers: Header[]): Route[] {
  return headers.map(h => {
    const obj: { [key: string]: string } = {};
    const { src, segments } = sourceToRegex(h.source);
    const hasSegments = collectHasSegments(h.has);
    const namedSegments = segments.filter(name => name !== UN_NAMED_SEGMENT);
    const indexes: { [k: string]: string } = {};

    segments.forEach((name, index) => {
      indexes[name] = toSegmentDest(index);
    });

    hasSegments.forEach(name => {
      indexes[name] = '$' + name;
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

    if (h.has) {
      route.has = h.has;
    }
    return route;
  });
}

export function convertTrailingSlash(enable: boolean, status = 308): Route[] {
  const routes: Route[] = [];
  if (enable) {
    routes.push({
      src: '^/\\.well-known(?:/.*)?$',
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

function collectHasSegments(has?: HasField) {
  const hasSegments = new Set<string>();

  for (const hasItem of has || []) {
    if (!hasItem.value && 'key' in hasItem) {
      hasSegments.add(hasItem.key);
    }

    if (hasItem.value) {
      const matcher = new RegExp(`^${hasItem.value}$`);
      const lexer = new Lexer();
      lexer.profile = lexerProfiles.js;
      lexer.parse(`/${matcher.source}/`);

      Object.keys(lexer.namedGroups).forEach(groupKey => {
        hasSegments.add(groupKey);
      });

      if (hasItem.type === 'host') {
        hasSegments.add('host');
      }
    }
  }
  return [...hasSegments];
}

function replaceSegments(
  segments: string[],
  hasItemSegments: string[],
  destination: string,
  isRedirect?: boolean
): string {
  const parsedDestination = parseUrl(destination, true);
  delete (parsedDestination as any).href;
  delete (parsedDestination as any).path;
  delete (parsedDestination as any).search;
  // eslint-disable-next-line prefer-const
  let { pathname, hash, query, ...rest } = parsedDestination;
  pathname = pathname || '';
  hash = hash || '';

  const namedSegments = segments.filter(name => name !== UN_NAMED_SEGMENT);

  if (namedSegments.length > 0 || hasItemSegments.length > 0) {
    const indexes: { [k: string]: string } = {};
    segments.forEach((name, index) => {
      indexes[name] = toSegmentDest(index);
    });

    // 'has' matches override 'source' matches
    hasItemSegments.forEach(name => {
      indexes[name] = '$' + name;
    });

    let destParams = new Set<string>();

    if (destination.includes(':')) {
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
