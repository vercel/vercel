/**
 * This converts Superstatic configuration to Now.json Routes
 * See https://github.com/firebase/superstatic#configuration
 */
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
  trailingSlash: boolean | undefined
): Route[] {
  const routes: Route[] = [];
  if (cleanUrls) {
    const loc = trailingSlash ? '/$1/' : '/$1';
    routes.push({
      src: '^/(?:(.+)/)?index(?:\\.html)?/?$',
      headers: { Location: loc },
      status: 308,
    });
    routes.push({
      src: '^/(.*)\\.html/?$',
      headers: { Location: loc },
      status: 308,
    });
  }
  return routes;
}

export function convertRedirects(redirects: NowRedirect[]): Route[] {
  return redirects.map(r => {
    const { src, segments } = sourceToRegex(r.source);
    const loc = replaceSegments(segments, r.destination);
    const route: Route = {
      src,
      headers: { Location: loc },
      status: r.statusCode || 308,
    };
    return route;
  });
}

export function convertRewrites(rewrites: NowRewrite[]): Route[] {
  return rewrites.map(r => {
    const { src, segments } = sourceToRegex(r.source);
    const dest = replaceSegments(segments, r.destination);
    const route: Route = { src, dest, check: true };
    return route;
  });
}

export function convertHeaders(headers: NowHeader[]): Route[] {
  return headers.map(h => {
    const obj: { [key: string]: string } = {};
    h.headers.forEach(kv => {
      obj[kv.key] = kv.value;
    });
    const route: Route = {
      src: h.source,
      headers: obj,
      continue: true,
    };
    return route;
  });
}

export function convertTrailingSlash(enable: boolean): Route[] {
  const routes: Route[] = [];
  if (enable) {
    routes.push({
      src: '^/(.*[^\\/])$',
      headers: { Location: '/$1/' },
      status: 308,
    });
  } else {
    routes.push({
      src: '^/(.*)\\/$',
      headers: { Location: '/$1' },
      status: 308,
    });
  }
  return routes;
}

function sourceToRegex(source: string): { src: string; segments: string[] } {
  const keys: Key[] = [];
  const r = pathToRegexp(source, keys, { strict: true });
  const segments = keys.map(k => k.name).filter(isString);
  return { src: r.source, segments };
}

function isString(key: any): key is string {
  return typeof key === 'string';
}

function replaceSegments(segments: string[], destination: string): string {
  const parsedDestination = parseUrl(destination, true);
  let { pathname } = parsedDestination;
  pathname = pathname || '';

  if (pathname.includes(':') && segments.length > 0) {
    const compiler = compile(pathname);
    const indexes: { [k: string]: string } = {};

    segments.forEach((name, index) => {
      indexes[name] = toSegmentDest(index);
    });
    pathname = compiler(indexes);
    destination = formatUrl({
      ...parsedDestination,
      pathname,
    });
  } else if (segments.length > 0) {
    let prefix = '?';
    segments.forEach((name, index) => {
      destination += `${prefix}${name}=${toSegmentDest(index)}`;
      prefix = '&';
    });
  }
  return destination;
}

function toSegmentDest(index: number): string {
  const i = index + 1; // js is base 0, regex is base 1
  return '$' + i.toString();
}

function toRoute(filePath: string): string {
  return filePath.startsWith('/') ? filePath : '/' + filePath;
}
