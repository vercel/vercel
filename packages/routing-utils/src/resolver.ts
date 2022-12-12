import { Route } from './types';
import { HandleValue, HasField } from './index';

// cache should be an LRU
export interface Cache {
  get(key: string): any;
  set(key: string, data: any): void;
}

// should be a quick/small hash function e.g. crc32
export type HashFunc = (content: string) => string;

// Get matches from a string with regex
export type MatchRegex = (
  regexString: string,
  testString: string
) => Record<string | number, string> | null;

// Replace via regex
export type RegexReplace = (
  regexString: string,
  originalString: string,
  replaceString: string
) => string;

// parse a url path to its parts
export type ParsePath = (urlPath: string) => {
  //  e.g. https or http (does not include ":")
  scheme?: string;
  // e.g. google.com
  host?: string;
  port?: number;
  pathname?: string;
  query?: Record<string, string | string[]>;
  // not prefixed with #
  hash?: string;
};

// encode query string
export type EncodeQuery = (query: Record<string, string | string[]>) => string;

// look up a filesystem path
export type CheckFileSystem = (outputName: string) => Promise<boolean>;

// look up directory files
export type CheckDirectory = (outputName: string) => Promise<string[]>;

// invoke middleware from its index
export type InvokeMiddleware = (
  middlewareIndex: number,
  ctx: {
    path: string;
    query: Record<string, string | string[] | undefined>;
    headers: Record<string, string | string[] | undefined>;
  }
) => Promise<{
  status: number;
  headers: Record<string, string[] | string | undefined>;
  body: any;
}>;

export interface CacheKeyParams {
  request_path_key: string;
  query: Record<string, undefined | string | string[]>;
  cookies: Record<string, string>;
  headers: Record<string, undefined | string | string[]>;
  used_query: string[];
  used_headers: string[];
  used_cookies: string[];
  used_preferred_locale?: string;
}

export interface SeparatedRoutes {
  before_filesystem: Route[];
  handle_filesystem: Route[];
  handle_error: Route[];
  handle_resource: Route[];
  handle_rewrite: Route[];
  handle_miss: Route[];
  handle_hit: Route[];
  has_handle_filesystem: boolean;
}

export type ErrorResult = {
  error: 'TOO_MANY_FILESYSTEM_CHECKS' | 'INTERNAL_ROUTER_CANNOT_PARSE_PATH';
};

export interface RoutingResult {
  dest_path: string;
  headers: Record<string, string[] | string | undefined>;
  important_headers: Record<string, string[] | string | undefined>;
  status: number;
  query: Record<string, undefined | string | string[]>;
  hash?: string;
  is_redirect: boolean;
  matched_output: boolean;
  is_optimized_image_request: boolean;
  finished: boolean;
  from_cache: boolean;
  error?: ErrorResult;
  file_system_checks: number;
  is_directory: boolean;
  is_external_rewrite?: boolean;
  directory_files?: string[];
  req_headers: Record<string, string>;
  body?: any;
  invoked_middleware?: number[];
}

// the separators here need to be unique to prevent
// overlap with valid header, query, or cookie key chars
// unless we want to encode/decode the key items
const GROUP_SEP = '_V_G_SEP_' as const;
const ITEM_SEP = '_V_I_SEP_' as const;

// number of filesystem checks to limit to
const FILE_SYSTEM_CHECK_LIMIT = 7 as const;

/**
 * Ensure only a-zA-Z are used for param names for proper interpolating
 * with path-to-regexp
 */
function get_safe_param_name(param_name: string) {
  let new_param_name = '';

  for (let i = 0; i < param_name.length; i++) {
    const charCode = param_name.charCodeAt(i);

    if (
      (charCode > 64 && charCode < 91) || // A-Z
      (charCode > 96 && charCode < 123) // a-z
    ) {
      new_param_name += param_name[i];
    }
  }
  return new_param_name;
}

function is_redirect(status: number) {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308 ||
    false
  );
}

const NONOVERRIDABLE_HEADERS = [
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'keep-alive',
  'transfer-encoding',
  'te',
  'upgrade',
  'trailer',
];

function apply_overriden_middleware_headers(
  req_headers: Record<string, string[] | string | undefined>,
  resp_headers: Record<string, string[] | string | undefined>
) {
  const overriddenHeaders = resp_headers[
    'x-middleware-override-headers'
  ] as string;

  if (!overriddenHeaders) {
    return;
  }
  const overridden_keys: Record<string, 1> = {};

  for (const key of overriddenHeaders.split(',')) {
    overridden_keys[key.trim()] = 1;
  }

  resp_headers['x-middleware-override-headers'] = undefined;

  // Delete headers.
  for (const key of Object.keys(req_headers)) {
    if (!NONOVERRIDABLE_HEADERS.includes(key) && !overridden_keys[key]) {
      delete req_headers[key];
    }
  }

  // Update or add headers.
  for (const key of Object.keys(overridden_keys)) {
    if (NONOVERRIDABLE_HEADERS.includes(key)) {
      continue;
    }

    const value_key = 'x-middleware-request-' + key;
    const new_value = resp_headers[value_key];
    const old_value = req_headers[key];

    if (old_value !== new_value) {
      if (new_value) {
        req_headers[key] = new_value;
      } else {
        req_headers[key] = undefined;
      }
    }

    resp_headers[value_key] = undefined;
  }
}

function generate_meta_cache_key({
  used_query,
  used_cookies,
  used_headers,
  used_preferred_locale,
}: {
  used_query: string[];
  used_headers: string[];
  used_cookies: string[];
  used_preferred_locale?: string;
}) {
  // sort entries to ensure deterministic key
  used_query.sort();
  used_headers.sort();
  used_cookies.sort();

  return `${used_query.join(ITEM_SEP)}${GROUP_SEP}${used_headers.join(
    ITEM_SEP
  )}${GROUP_SEP}${used_cookies.join(ITEM_SEP)}${GROUP_SEP}${
    used_preferred_locale || ''
  }`;
}

function get_handle_routes(routes: Route[]): SeparatedRoutes {
  const separated_routes: SeparatedRoutes = {
    before_filesystem: [],
    handle_filesystem: [],
    handle_hit: [],
    handle_miss: [],
    handle_error: [],
    handle_rewrite: [],
    handle_resource: [],
    has_handle_filesystem: false,
  };
  let current_handle: HandleValue | 'before_filesystem' = 'before_filesystem';

  for (const route of routes) {
    let routes_group = `handle_${current_handle}` as keyof SeparatedRoutes;

    if (current_handle === 'before_filesystem') {
      routes_group = 'before_filesystem';
    }
    if ('handle' in route) {
      if (route.handle === 'filesystem') {
        separated_routes.has_handle_filesystem = true;
      }
      current_handle = route.handle;
      continue;
    }
    const cur_separate_routes = separated_routes[routes_group];

    if (Array.isArray(cur_separate_routes)) {
      cur_separate_routes.push(route);
    }
  }
  return separated_routes;
}

export function get_resolver({
  hash_func,
  route_key_meta_cache,
  route_result_cache,
  file_system_check_limit = FILE_SYSTEM_CHECK_LIMIT,
  check_file_system: original_check_file_system,
  check_directory,
  invoke_middleware,
  match_regex,
  regex_replace,
  parse_path,
  encode_query,
}: {
  route_key_meta_cache?: Cache;
  route_result_cache?: Cache;
  hash_func: HashFunc;
  invoke_middleware?: InvokeMiddleware;
  file_system_check_limit?: number;
  check_file_system: CheckFileSystem;
  check_directory?: CheckDirectory;
  match_regex: MatchRegex;
  regex_replace: RegexReplace;
  parse_path: ParsePath;
  encode_query: EncodeQuery;
}) {
  function is_optimized_image_request(path: string) {
    return !!match_regex('^/(?:_next|_vercel)/image/?(\\?|$)', path);
  }

  // ensure we normalize slashes in destinations properly
  function normalize_path(path: string) {
    path = regex_replace('\\\\+', path, '/');
    path = regex_replace('//+', path, '/');
    return path;
  }

  function stringify_path(parsed_path: ReturnType<typeof parse_path>): string {
    const query_string = `${
      parsed_path.query ? '?' + encode_query(parsed_path.query) : ''
    }`;
    const hash_string = `${parsed_path.hash ? '#' : ''}${
      parsed_path.hash || ''
    }`;

    if (parsed_path.scheme && parsed_path.host) {
      return `${parsed_path.scheme}://${parsed_path.host}${
        parsed_path.port ? ':' : ''
      }${parsed_path.port || ''}${
        parsed_path.pathname
      }${query_string}${hash_string}`;
    }
    return `${parsed_path.pathname}${query_string}${hash_string}`;
  }

  function replace_groups(
    groups: Record<string, string | undefined>,
    item: string
  ): string {
    // sort keys longest -> shortest
    const group_keys = Object.keys(groups).sort((a, b) =>
      a.length > b.length ? -1 : a.length === b.length ? 0 : 1
    );
    const dollar_placeholder = '__internal_escaped_dollar__';

    for (const key of group_keys) {
      // escape "$" in group value to prevent dropping during replace
      let group_item = groups[key];

      if (group_item) {
        group_item = regex_replace('\\$', group_item, dollar_placeholder);
        item = regex_replace(`\\$${key}`, item, group_item);
      }
    }
    // un-escape "$" once done replacing groups
    return regex_replace(dollar_placeholder, item, '$$');
  }

  function get_cache_entry({
    request_path_key,
    cookies,
    headers,
    query,
  }: {
    request_path_key: string;
    cookies: Record<string, string>;
    headers: Record<string, string | string[] | undefined>;
    query: Record<string, string | string[] | undefined>;
  }): RoutingResult | null {
    const request_key = route_key_meta_cache?.get(request_path_key);

    if (!request_key) return null;

    const [
      used_query_str,
      used_headers_str,
      used_cookies_str,
      used_preferred_locale_str,
    ] = request_key.split(GROUP_SEP);

    const used_query = used_query_str.split(ITEM_SEP);
    const used_headers = used_headers_str.split(ITEM_SEP);
    const used_cookies = used_cookies_str.split(ITEM_SEP);
    const used_preferred_locale = used_preferred_locale_str;

    const cacheKey = generate_result_cache_key({
      request_path_key,
      headers,
      query,
      cookies,
      used_query,
      used_cookies,
      used_headers,
      used_preferred_locale,
    });
    return route_result_cache?.get(cacheKey);
  }

  function generate_result_cache_key({
    request_path_key,
    headers,
    query,
    cookies,
    used_query,
    used_headers,
    used_cookies,
  }: CacheKeyParams) {
    // sort entries to ensure deterministic key
    used_query.sort();
    used_headers.sort();
    used_cookies.sort();

    const getKeyPart = (
      keys: string[],
      values: Record<string, undefined | string | string[]>
    ) => {
      let keyPart = '';

      for (const key of keys) {
        keyPart += `${values[key] || ''}`;
      }
      return hash_func(keyPart);
    };

    const queryKey = getKeyPart(used_query, query);
    const headerKey = getKeyPart(used_headers, headers);
    const cookieKey = getKeyPart(used_cookies, cookies);

    return `${request_path_key}${GROUP_SEP}${queryKey}${GROUP_SEP}${headerKey}${GROUP_SEP}${cookieKey}`;
  }

  return async function resolve_routes({
    routes,
    request_path,
    deployment_id,
    host,
    wildcard,
    request_method,
    preferred_locales,
    query,
    headers,
    cookies,
    only_error_routes,
    error_status,
    skip_handle_error,
  }: {
    host: string;
    wildcard: string;
    preferred_locales?: string[];
    deployment_id: string;
    routes: Array<Route>;
    request_path: string;
    request_method: string;
    query: Record<string, string | string[] | undefined>;
    headers: Record<string, string | string[] | undefined>;
    cookies: Record<string, string>;
    only_error_routes?: boolean;
    error_status?: number;
    skip_handle_error?: boolean;
  }): Promise<RoutingResult> {
    const request_path_key = `${request_method}${host}${deployment_id}${wildcard}${request_path}${error_status}${skip_handle_error}`;

    const cacheEntry = get_cache_entry({
      request_path_key,
      query,
      headers,
      cookies,
    });

    let routing_result: RoutingResult = {
      dest_path: request_path,
      headers: {},
      important_headers: {},
      status: error_status || 200,
      query: {},
      is_redirect: false,
      matched_output: false,
      is_optimized_image_request: false,
      finished: false,
      from_cache: false,
      file_system_checks: 0,
      is_directory: false,
      req_headers: {},
    };

    // when middleware is matched we must re-resolve
    // instead of returning cached entry directly so
    // middleware is re-invoked (TODO investigate caching)
    // routing_result state before/post middleware to reduce
    // regex resolving a bit
    if (cacheEntry && !cacheEntry.invoked_middleware) {
      routing_result = {
        ...cacheEntry,
        from_cache: true,
      };
      return routing_result;
    }

    async function check_file_system(outputName: string, finalCheck?: boolean) {
      if (
        routing_result.file_system_checks > file_system_check_limit &&
        !finalCheck
      ) {
        routing_result.finished = true;
        routing_result.error = { error: 'TOO_MANY_FILESYSTEM_CHECKS' };
        return false;
      }

      if (is_optimized_image_request(outputName)) {
        routing_result.finished = true;
        routing_result.is_optimized_image_request = true;
        return true;
      }

      routing_result.file_system_checks += 1;

      if (await original_check_file_system(outputName)) {
        routing_result.matched_output = true;
        routing_result.finished = true;
        return true;
      }
    }
    // no cache available, continue to resolve route

    // track query, header, and cookie usage for caching route
    // even if a item isn't a match we still track it's usage
    // for caching
    const used_query: Record<string, 1> = {};
    const used_headers: Record<string, 1> = {};
    const used_cookies: Record<string, 1> = {};
    let used_preferred_locale: string | undefined;

    const separated_routes = get_handle_routes(routes);

    function match_route(
      route: Route
    ): Record<string, string | undefined> | null {
      let matches: Record<string | number, string> | null = null;

      if (route.src) {
        matches = match_regex(route.src, routing_result.dest_path);
      }

      function has_match(hasItem: HasField[number]) {
        let value: undefined | string;
        let key = 'key' in hasItem && hasItem.key;

        switch (hasItem.type) {
          case 'header': {
            if (key) {
              key = key.toLowerCase();
              used_headers[key] = 1;
              value = headers[key] as string;
            }
            break;
          }
          case 'cookie': {
            if (key) {
              value = cookies[hasItem.key];
              used_cookies[hasItem.key.toLowerCase()] = 1;
            }
            break;
          }
          case 'query': {
            if (key) {
              const cur_value = query[key!];

              if (Array.isArray(cur_value)) {
                value = cur_value[cur_value.length - 1];
              } else {
                value = cur_value;
              }
              used_query[key.toLowerCase()] = 1;
            }
            break;
          }
          case 'host': {
            let { host } = headers;
            host = (host || '') as string;
            // remove port from host if present
            const hostname = host.split(':')[0].toLowerCase();
            value = hostname;
            break;
          }
          default: {
            break;
          }
        }

        if (!hasItem.value && value && key) {
          if (!matches) matches = {};
          matches[get_safe_param_name(key)] = value;
          return true;
        } else if (value) {
          const matcher = `^${hasItem.value}$`;
          const cur_matches = match_regex(
            matcher,
            Array.isArray(value) ? value.slice(-1)[0] : value
          );

          if (cur_matches) {
            if (!matches) {
              matches = {};
            }
            for (const groupKey of Object.keys(cur_matches)) {
              matches[groupKey] = cur_matches[groupKey];
            }
            if (hasItem.type === 'host' && cur_matches[0]) {
              matches.host = cur_matches[0];
            }
            return true;
          }
        }
        return false;
      }

      if (matches && ('has' in route || 'missing' in route)) {
        const valid_has_missing =
          !!route.has?.every(has_item => has_match(has_item)) &&
          !route.missing?.some(item => has_match(item));

        if (!valid_has_missing) {
          matches = null;
        }
      }
      return matches;
    }

    // check: true first checks for a matching output and if none
    // it then checks handle: 'rewrite' routes
    async function handle_check_true(
      phase?: HandleValue | 'before_filesystem'
    ) {
      if (phase !== 'miss') {
        await handle_routes(separated_routes.handle_miss, 'miss');
      }

      if (routing_result.finished) {
        return true;
      }
      const matched = await check_file_system(routing_result.dest_path);

      if (routing_result.error) {
        return routing_result;
      }

      if (matched) {
        return true;
      }
      await handle_routes(separated_routes.handle_rewrite, 'rewrite');

      if (!routing_result.finished && phase !== 'miss') {
        await handle_routes(separated_routes.handle_miss, 'miss');
      }
    }

    function handle_dest(
      parsed_path: ReturnType<typeof parse_path>,
      matches: Record<string, string | undefined>
    ) {
      parsed_path.pathname = normalize_path(parsed_path.pathname || '');

      if (parsed_path.scheme && parsed_path.host && parsed_path.host !== host) {
        routing_result.finished = true;
        routing_result.dest_path = stringify_path(parsed_path);
        routing_result.is_external_rewrite = true;
      } else if (parsed_path.pathname) {
        routing_result.dest_path = parsed_path.pathname;

        if (parsed_path.query) {
          // query doesn't stack from previous destinations so reset
          routing_result.query = {};

          for (const key of Object.keys(parsed_path.query)) {
            const original_item = parsed_path.query[key];
            const item = Array.isArray(original_item)
              ? original_item.slice(-1)[0]
              : original_item;

            routing_result.query[key] = replace_groups(matches, item || '');
          }
        }
        if (parsed_path.hash) {
          routing_result.hash = replace_groups(matches, parsed_path.hash);
        }
      }
    }

    async function handle_routes(
      routes: Route[],
      phase?: HandleValue | 'before_filesystem'
    ) {
      for (const route of routes) {
        const matches = match_route(route);

        // if we encounter an error we bail
        if (routing_result.error) {
          break;
        }

        // keep checking if not a match
        if (!matches) {
          continue;
        }

        // this is an invariant but should be caught during route validation
        // but just in case we safe guard here and skip non-continue routes
        if (phase === 'hit' && !('continue' in route && route.continue)) {
          continue;
        }

        // when matching in error phase and status is defined
        // the provided status must match
        if (
          phase === 'error' &&
          'status' in route &&
          route.status !== error_status
        ) {
          continue;
        }

        if (
          preferred_locales &&
          'locale' in route &&
          route.locale &&
          route.locale.redirect
        ) {
          // handle locale route
          const normalized_redirects: Record<string, string> = {};

          for (const locale of Object.keys(route.locale.redirect)) {
            normalized_redirects[locale.toLowerCase()] =
              route.locale.redirect[locale];
          }

          const locales: string[] = [];

          if (route.locale.cookie) {
            used_cookies[route.locale.cookie] = 1;
            locales.push(cookies[`${route.locale.cookie}`]);
          } else if (cookies['vercel_locale']) {
            used_cookies['vercel_locale'];
            locales.push(cookies['vercel_locale']);
          }

          for (const locale of preferred_locales) {
            locales.push(locale);
          }

          for (let locale of locales) {
            locale = locale.toLowerCase();
            const locale_redirect = normalized_redirects[locale];

            if (locale_redirect) {
              used_preferred_locale = locale;
              routing_result.status = 307;
              routing_result.is_redirect = true;
              routing_result.finished = true;

              const parsed_redirect = parse_path(
                replace_groups(matches, locale_redirect)
              );
              parsed_redirect.pathname = normalize_path(
                parsed_redirect.pathname || ''
              );

              routing_result.headers.location = stringify_path(parsed_redirect);
              break;
            }
          }
        }

        if (
          invoke_middleware &&
          'middleware' in route &&
          typeof route.middleware === 'number' &&
          !routing_result?.invoked_middleware?.includes(route.middleware)
        ) {
          if (!routing_result.invoked_middleware) {
            routing_result.invoked_middleware = [];
          }
          routing_result.invoked_middleware.push(route.middleware);

          const middleware_context = {
            path: routing_result.dest_path,
            query: routing_result.query,
            headers: routing_result.headers,
          };
          const middleware_result = await invoke_middleware(
            route.middleware,
            middleware_context
          );

          if (middleware_result.status !== 200) {
            routing_result.status = middleware_result.status;
            routing_result.finished = true;
            routing_result.body = middleware_result.body;
          }

          if (middleware_result.headers) {
            if (middleware_result.headers['x-middleware-refresh']) {
              routing_result.finished = true;
              routing_result.body = '';
            }
            const redirect = middleware_result.headers[
              'x-middleware-redirect'
            ] as string;

            if (redirect) {
              const parsed_dest = parse_path(replace_groups(matches, redirect));
              parsed_dest.pathname = normalize_path(parsed_dest.pathname || '');
              routing_result.headers.location = stringify_path(parsed_dest);
              routing_result.is_redirect = true;
              routing_result.finished = true;
              middleware_result.headers['x-middleware-redirect'] = undefined;
            }
            const rewrite = middleware_result.headers[
              'x-middleware-rewrite'
            ] as string;

            if (rewrite) {
              const parsed_path = parse_path(replace_groups(matches, rewrite));
              handle_dest(parsed_path, matches);
            }

            apply_overriden_middleware_headers(
              routing_result.req_headers,
              middleware_result.headers
            );

            for (const key of Object.keys(middleware_result.headers)) {
              const cur_value = middleware_result.headers[key];

              if (Array.isArray(cur_value)) {
                routing_result.headers[key] = cur_value[cur_value.length - 1];
              } else {
                routing_result.headers[key] = cur_value;
              }
            }
          }

          if (middleware_result.body) {
            routing_result.body = middleware_result.body;
            routing_result.finished = true;
          }
        }

        if ('headers' in route && route.headers) {
          for (const key of Object.keys(route.headers)) {
            if ('important' in route && route.important) {
              if (!routing_result.important_headers[key]) {
                routing_result.important_headers[key] = replace_groups(
                  matches,
                  route.headers[key]
                );
              }
            } else {
              if (!routing_result.headers[key]) {
                routing_result.headers[key] = replace_groups(
                  matches,
                  route.headers[key]
                );
              }
            }
          }
        }

        if ('dest' in route && route.dest) {
          const parsed_dest = parse_path(replace_groups(matches, route.dest));
          handle_dest(parsed_dest, matches);
        }

        if ('status' in route && route.status) {
          routing_result.status = route.status;

          // when a redirect we don't continue iterating
          // even if continue: true is set
          if (is_redirect(route.status)) {
            routing_result.is_redirect = true;
            routing_result.finished = true;
            break;
          }
        }

        if ('check' in route && route.check) {
          // if check: true matches we stop iterating
          if (phase === 'rewrite') {
            // don't retrigger check: true if we're in handle: 'rewrite' section
            if (await check_file_system(routing_result.dest_path)) {
              break;
            }
          } else if (await handle_check_true(phase)) {
            break;
          }
        } else if (!('continue' in route && route.continue)) {
          // we only continue for check: true or continue: true

          if (routing_result.dest_path.startsWith('/')) {
            await check_file_system(routing_result.dest_path);
          }
          break;
        }
      }
    }

    // start with before filesystem routes
    if (!only_error_routes) {
      await handle_routes(
        separated_routes.before_filesystem,
        'before_filesystem'
      );
    }

    // trigger filesystem check if handle: 'filesystem' is present
    if (
      !routing_result.finished &&
      separated_routes.has_handle_filesystem &&
      !only_error_routes
    ) {
      const matched = await check_file_system(routing_result.dest_path);

      if (matched) {
        routing_result.matched_output = true;
        routing_result.finished = true;
      }
    }

    if (!routing_result.finished && !only_error_routes) {
      // check routes post-filesystem e.g. afterFiles rewrites
      await handle_routes(separated_routes.handle_filesystem, 'filesystem');
    }

    // if we still aren't finished we trigger the same checks as "check: true"
    // which checks filesystem and then handle: 'rewrite'
    if (!routing_result.finished && !only_error_routes) {
      await handle_check_true();
    }

    if (!routing_result.finished && !only_error_routes) {
      // if we haven't matched yet we check handle: 'resource' routes
      await handle_routes(separated_routes.handle_resource, 'resource');

      if (!routing_result.finished && check_directory) {
        const directory_files = await check_directory(routing_result.dest_path);

        if (directory_files.length > 0) {
          routing_result.finished = true;
          routing_result.is_directory = true;
          routing_result.directory_files = directory_files;
        }
      }
    }

    if (!routing_result.finished && !skip_handle_error) {
      // if we still don't have a match check handle: 'error' or 404
      if (!error_status) {
        error_status = 404;
        routing_result.status = 404;
      }
      await handle_routes(separated_routes.handle_error, 'error');
    }

    if (routing_result.matched_output) {
      // we only apply handle: 'hit' when an output was matched
      await handle_routes(separated_routes.handle_hit, 'hit');
    }
    const used_query_arr = Object.keys(used_query);
    const used_headers_arr = Object.keys(used_headers);
    const used_cookies_arr = Object.keys(used_cookies);

    const meta_key = generate_meta_cache_key({
      used_query: used_query_arr,
      used_headers: used_headers_arr,
      used_cookies: used_cookies_arr,
      used_preferred_locale,
    });
    const result_key = generate_result_cache_key({
      request_path_key,
      query,
      headers,
      cookies,
      used_query: used_query_arr,
      used_headers: used_headers_arr,
      used_cookies: used_cookies_arr,
      used_preferred_locale,
    });
    route_key_meta_cache?.set(request_path_key, meta_key);
    route_result_cache?.set(result_key, routing_result);
    return routing_result;
  };
}
