/**
 * This converts Superstatic configuration to vercel.json Routes
 * See https://github.com/firebase/superstatic#configuration
 */
import { isString } from 'util';
import { parse as parseUrl, format as formatUrl } from 'url';
import { pathToRegexp, compile, Key } from 'path-to-regexp';
import { Route, NowRedirect, NowRewrite, NowHeader } from './types';

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
    const hasSegments = segments.length > 0;
    const indexes: { [k: string]: string } = {};

    segments.forEach((name, index) => {
      indexes[name] = toSegmentDest(index);
    });

    h.headers.forEach(({ key, value }) => {
      if (hasSegments) {
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
  const segments = keys.map(k => k.name).filter(isString);
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
  if (segments.length > 0) {
    const indexes: { [k: string]: string } = {};
    segments.forEach((name, index) => {
      indexes[name] = toSegmentDest(index);
    });

    if (destination.includes(':') && segments.length > 0) {
      pathname = safelyCompile(pathname, indexes);
      hash = hash ? safelyCompile(hash, indexes) : null;

      for (const [key, strOrArray] of Object.entries(query)) {
        let value = Array.isArray(strOrArray) ? strOrArray[0] : strOrArray;
        if (value) {
          value = safelyCompile(value, indexes);
        }
        query[key] = value;
      }
    }

    // We only add path segments to redirect queries if manually
    // specified
    if (!isRedirect) {
      for (const [name, value] of Object.entries(indexes)) {
        if (!(name in query)) {
          query[name] = value;
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

function safelyCompile(str: string, indexes: { [k: string]: string }): string {
  if (!str) {
    return str;
  }
  // path-to-regexp cannot compile question marks
  return str
    .split('?')
    .map(part => {
      const compiler = compile(part);
      return compiler(indexes);
    })
    .join('?');
}

function toSegmentDest(index: number): string {
  const i = index + 1; // js is base 0, regex is base 1
  return '$' + i.toString();
}

function toRoute(filePath: string): string {
  return filePath.startsWith('/') ? filePath : '/' + filePath;
}
