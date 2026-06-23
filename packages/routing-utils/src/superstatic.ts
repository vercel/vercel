/**
 * This converts Superstatic configuration to vercel.json Routes
 * See https://github.com/firebase/superstatic#configuration
 */
import { parse as parseUrl, format as formatUrl } from 'url';
import {
  Route,
  RouteWithSrc,
  Redirect,
  Rewrite,
  HasField,
  Header,
} from './types';

/*
  [START] Temporary double-install of path-to-regexp to compare the impact of the update
  https://linear.app/vercel/issue/ZERO-3067/log-potential-impact-of-path-to-regexpupdate
*/
import {
  pathToRegexp as pathToRegexpCurrent,
  Key,
  compile,
} from 'path-to-regexp';
import { pathToRegexp as pathToRegexpUpdated } from 'path-to-regexp-updated';

function cloneKeys(keys: Key[] | undefined): Key[] | undefined {
  if (typeof keys === 'undefined') {
    return undefined;
  }

  return keys.slice(0);
}

function compareKeys(left: Key[] | undefined, right: Key[] | undefined) {
  const leftSerialized =
    typeof left === 'undefined' ? 'undefined' : left.toString();
  const rightSerialized =
    typeof right === 'undefined' ? 'undefined' : right.toString();
  return leftSerialized === rightSerialized;
}

// run the updated version of path-to-regexp, compare the results, and log if different
export function pathToRegexp(
  callerId: string,
  path: string,
  keys?: Key[],
  options?: { strict: boolean; sensitive: boolean; delimiter: string }
) {
  const newKeys = cloneKeys(keys);
  const currentRegExp = pathToRegexpCurrent(path, keys, options);

  try {
    const currentKeys = keys;
    const newRegExp = pathToRegexpUpdated(path, newKeys, options);

    // FORCE_PATH_TO_REGEXP_LOG can be used to force these logs to render
    // for verification that they show up in the build logs as expected

    const isDiffRegExp = currentRegExp.toString() !== newRegExp.toString();
    if (process.env.FORCE_PATH_TO_REGEXP_LOG || isDiffRegExp) {
      const message = JSON.stringify({
        path,
        currentRegExp: currentRegExp.toString(),
        newRegExp: newRegExp.toString(),
      });
      console.error(`[vc] PATH TO REGEXP PATH DIFF @ #${callerId}: ${message}`);
    }

    const isDiffKeys = !compareKeys(keys, newKeys);
    if (process.env.FORCE_PATH_TO_REGEXP_LOG || isDiffKeys) {
      const message = JSON.stringify({
        isDiffKeys,
        currentKeys,
        newKeys,
      });
      console.error(`[vc] PATH TO REGEXP KEYS DIFF @ #${callerId}: ${message}`);
    }
  } catch (err) {
    const error = err as Error;
    const message = JSON.stringify({
      path,
      error: error.message,
    });

    console.error(`[vc] PATH TO REGEXP ERROR @ #${callerId}: ${message}`);
  }

  return currentRegExp;
}
/*
  [END] Temporary double-install of path-to-regexp to compare the impact of the update
  https://linear.app/vercel/issue/ZERO-3067/log-potential-impact-of-path-to-regexpupdate
*/

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
    normalizeHasKeys(r.has);
    normalizeHasKeys(r.missing);

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

      if (typeof r.env !== 'undefined') {
        route.env = r.env;
      }
      if (r.has) {
        route.has = r.has;
      }
      if (r.missing) {
        route.missing = r.missing;
      }
      return route;
    } catch (_e) {
      throw new Error(`Failed to parse redirect: ${JSON.stringify(r)}`);
    }
  });
}

export function convertRewrites(
  rewrites: Rewrite[],
  internalParamNames?: string[]
): Route[] {
  return rewrites.map(r => {
    const { src, segments } = sourceToRegex(r.source);
    const hasSegments = collectHasSegments(r.has);
    normalizeHasKeys(r.has);
    normalizeHasKeys(r.missing);

    try {
      // Replace `:param` placeholders with `$1`/`$name` backrefs that point at
      // the source's capture groups.
      const interpolate = (value: string): string =>
        replaceSegments(
          segments,
          hasSegments,
          value,
          false,
          internalParamNames
        );

      let route: RouteWithSrc;
      if (typeof r.destination === 'string') {
        route = { src, dest: interpolate(r.destination), check: true };
      } else {
        // Service destination: a terminal handoff into the target service's
        // route table. Interpolate `path` like a string `dest`.
        const destination = { ...r.destination };
        if (typeof destination.path === 'string') {
          destination.path = interpolate(destination.path);
        }
        route = { src, destination };
      }

      if (r.transforms) {
        route.transforms = r.transforms.map(transform => {
          if (transform.type !== 'request.path') {
            return { ...transform };
          }

          return {
            ...transform,
            args: compilePathToRegexpTemplateFromSegments(
              transform.args,
              segments,
              hasSegments,
              transform.env
            ),
          };
        });
      }

      if (typeof r.env !== 'undefined') {
        route.env = r.env;
      }
      if (r.has) {
        route.has = r.has;
      }
      if (r.missing) {
        route.missing = r.missing;
      }
      if (r.statusCode) {
        route.status = r.statusCode;
      }
      return route;
    } catch (_e) {
      throw new Error(`Failed to parse rewrite: ${JSON.stringify(r)}`);
    }
  });
}

export function convertHeaders(headers: Header[]): Route[] {
  return headers.map(h => {
    const obj: { [key: string]: string } = {};
    const { src, segments } = sourceToRegex(h.source);
    const hasSegments = collectHasSegments(h.has);
    normalizeHasKeys(h.has);
    normalizeHasKeys(h.missing);

    const namedSegments = segments.filter(name => name !== UN_NAMED_SEGMENT);
    const indexes: { [k: string]: string } = {};

    segments.forEach((name, index) => {
      indexes[name] = toSegmentDest(index);
    });

    hasSegments.forEach(name => {
      indexes[name] = '$' + name;
    });

    h.headers.forEach(({ key, value }) => {
      if (namedSegments.length > 0 || hasSegments.length > 0) {
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
    if (h.missing) {
      route.missing = h.missing;
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

export function sourceToRegex(source: string): {
  src: string;
  segments: string[];
} {
  const keys: Key[] = [];
  const r = pathToRegexp('632', source, keys, {
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

// The ECMA-262 specification explicitly allows for underscores in
// CaptureGroupName's (see https://tc39.es/ecma262/#prod-GroupName).
const namedGroupsRegex = /\(\?<([a-zA-Z][a-zA-Z0-9_]*)>/g;

const normalizeHasKeys = (hasItems: HasField = []) => {
  for (const hasItem of hasItems) {
    if ('key' in hasItem && hasItem.type === 'header') {
      hasItem.key = hasItem.key.toLowerCase();
    }
  }
  return hasItems;
};

function getStringValueForRegex(
  value: HasField[number]['value'] | undefined
): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && value !== null) {
    if ('re' in value && typeof value.re === 'string') {
      return value.re;
    }
  }

  return null;
}

export function collectHasSegments(has?: HasField) {
  const hasSegments = new Set<string>();

  for (const hasItem of has || []) {
    if (!hasItem.value && 'key' in hasItem) {
      hasSegments.add(hasItem.key);
    }

    const stringValue = getStringValueForRegex(hasItem.value);
    if (stringValue) {
      for (const match of stringValue.matchAll(namedGroupsRegex)) {
        if (match[1]) {
          hasSegments.add(match[1]);
        }
      }

      if (hasItem.type === 'host') {
        hasSegments.add('host');
      }
    }
  }
  return [...hasSegments];
}

const escapeSegment = (str: string, segmentName: string) =>
  str.replace(new RegExp(`:${segmentName}`, 'g'), `__ESC_COLON_${segmentName}`);

const unescapeSegments = (str: string) => str.replace(/__ESC_COLON_/gi, ':');

const pathTemplateSegmentNameRegex = /^([a-zA-Z_][a-zA-Z0-9_]*)/;

function isEscaped(value: string, index: number): boolean {
  let backslashCount = 0;
  for (let i = index - 1; i >= 0 && value[i] === '\\'; i--) {
    backslashCount++;
  }
  return backslashCount % 2 === 1;
}

function collectPathTemplateSegments(template: string): string[] {
  const segments: string[] = [];

  for (let i = 0; i < template.length; i++) {
    if (template[i] !== ':' || isEscaped(template, i)) {
      continue;
    }

    const match = template.slice(i + 1).match(pathTemplateSegmentNameRegex);
    if (match) {
      segments.push(match[1]);
      i += match[1].length;
    }
  }

  return segments;
}

function collectNamedDollarReferences(template: string): string[] {
  const references: string[] = [];

  for (let i = 0; i < template.length; i++) {
    if (template[i] !== '$' || isEscaped(template, i)) {
      continue;
    }

    const remainder = template.slice(i + 1);
    const bracedMatch = remainder.match(/^\{([a-zA-Z_][a-zA-Z0-9_]*)\}/);
    const unbracedMatch = remainder.match(pathTemplateSegmentNameRegex);
    const name = bracedMatch?.[1] || unbracedMatch?.[1];
    if (name) {
      references.push(name);
    }
  }

  return references;
}

function compilePathToRegexpTemplateFromSegments(
  template: string,
  segments: string[],
  hasItemSegments: string[],
  env: string[] = []
): string {
  const indexes: Record<string, string> = {};

  segments.forEach((name, index) => {
    indexes[name] = toSegmentDest(index);
  });

  // Named `has` captures remain named in the low-level route matcher.
  hasItemSegments.forEach(name => {
    indexes[name] = `$${name}`;
  });

  for (const name of collectPathTemplateSegments(template)) {
    if (!(name in indexes)) {
      throw new Error(
        `Path template references parameter ":${name}" that is not present in the source or has conditions.`
      );
    }
  }

  const routeParameters = new Set([
    ...segments.filter(name => name !== UN_NAMED_SEGMENT),
    ...hasItemSegments,
  ]);
  for (const name of collectNamedDollarReferences(template)) {
    if (routeParameters.has(name) && !env.includes(name)) {
      throw new Error(
        `Path template references route parameter "${name}" as \`$${name}\`. Use \`:${name}\` path-to-regexp syntax in high-level rewrites, or list "${name}" in the transform env allowlist if it is an environment variable.`
      );
    }
  }

  return safelyCompile(template, indexes, true);
}

/**
 * Compiles a high-level path-to-regexp template into the capture syntax used by
 * low-level routes. Source parameters become numbered captures (`:path*` ->
 * `$1`) while named `has` captures remain named (`:tenant` -> `$tenant`).
 * Existing `$N` and environment-variable references are preserved. An env
 * allowlist disambiguates a `$name` reference that collides with a route param.
 */
export function compilePathToRegexpTemplate(
  source: string,
  template: string,
  has?: HasField,
  env?: string[]
): string {
  const { segments } = sourceToRegex(source);
  return compilePathToRegexpTemplateFromSegments(
    template,
    segments,
    collectHasSegments(has),
    env
  );
}

function replaceSegments(
  segments: string[],
  hasItemSegments: string[],
  destination: string,
  isRedirect?: boolean,
  internalParamNames?: string[]
): string {
  const namedSegments = segments.filter(name => name !== UN_NAMED_SEGMENT);
  const canNeedReplacing =
    (destination.includes(':') && namedSegments.length > 0) ||
    hasItemSegments.length > 0 ||
    !isRedirect;

  if (!canNeedReplacing) {
    return destination;
  }
  let escapedDestination = destination;

  const indexes: { [k: string]: string } = {};
  segments.forEach((name, index) => {
    indexes[name] = toSegmentDest(index);
    escapedDestination = escapeSegment(escapedDestination, name);
  });

  // 'has' matches override 'source' matches
  hasItemSegments.forEach(name => {
    indexes[name] = '$' + name;
    escapedDestination = escapeSegment(escapedDestination, name);
  });

  const parsedDestination = parseUrl(escapedDestination, true);
  delete (parsedDestination as any).href;
  delete (parsedDestination as any).path;
  delete (parsedDestination as any).search;
  delete (parsedDestination as any).host;
  let { pathname, hash, query, hostname, ...rest } = parsedDestination;
  pathname = unescapeSegments(pathname || '');
  hash = unescapeSegments(hash || '');
  hostname = unescapeSegments(hostname || '');

  let destParams = new Set<string>();

  const pathnameKeys: Key[] = [];
  const hashKeys: Key[] = [];
  const hostnameKeys: Key[] = [];

  try {
    pathToRegexp('528', pathname, pathnameKeys);
    pathToRegexp('834', hash || '', hashKeys);
    pathToRegexp('712', hostname || '', hostnameKeys);
  } catch (_) {
    // this is not fatal so don't error when failing to parse the
    // params from the destination
  }

  destParams = new Set(
    [...pathnameKeys, ...hashKeys, ...hostnameKeys]
      .map(key => key.name)
      .filter(val => typeof val === 'string') as string[]
  );

  pathname = safelyCompile(pathname, indexes, true);
  hash = hash ? safelyCompile(hash, indexes, true) : null;
  hostname = hostname ? safelyCompile(hostname, indexes, true) : null;

  for (const [key, strOrArray] of Object.entries(query)) {
    if (Array.isArray(strOrArray)) {
      query[key] = strOrArray.map(str =>
        safelyCompile(unescapeSegments(str), indexes, true)
      );
    } else {
      // TODO: handle strOrArray is undefined
      query[key] = safelyCompile(
        unescapeSegments(strOrArray as string),
        indexes,
        true
      );
    }
  }

  // We only add path segments to redirect queries if manually
  // specified and only automatically add them for rewrites if one
  // or more params aren't already used in the destination's path
  const paramKeys = Object.keys(indexes);
  const needsQueryUpdating =
    // we do not consider an internal param since it is added automatically
    !isRedirect &&
    !paramKeys.some(
      param =>
        !(internalParamNames && internalParamNames.includes(param)) &&
        destParams.has(param)
    );

  if (needsQueryUpdating) {
    for (const param of paramKeys) {
      if (!(param in query) && param !== UN_NAMED_SEGMENT) {
        query[param] = indexes[param];
      }
    }
  }

  destination = formatUrl({
    ...rest,
    hostname,
    pathname,
    query,
    hash,
  });

  // url.format() escapes the dollar sign but it must be preserved for now-proxy
  return destination.replace(/%24/g, '$');
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
    } catch (_e) {
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
  return compile(`/${value}`, { validate: false })(indexes).slice(1);
}

function toSegmentDest(index: number): string {
  const i = index + 1; // js is base 0, regex is base 1
  return '$' + i.toString();
}

function toRoute(filePath: string): string {
  return filePath.startsWith('/') ? filePath : '/' + filePath;
}
