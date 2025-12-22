import { cacheHeader } from 'pretty-cache-header';
import { validateRegexPattern, parseCronExpression } from './utils/validation';
import type { Redirect, Rewrite } from './types';

/**
 * Type utility to extract path parameter names from a route pattern string.
 * Supports :paramName syntax used in path-to-regexp patterns.
 *
 * @example
 * ExtractPathParams<'/users/:userId/posts/:postId'> // 'userId' | 'postId'
 * ExtractPathParams<'/api/(.*)'> // never
 */
type ExtractPathParams<T extends string> =
  T extends `${string}:${infer Param}/${infer Rest}`
    ?
        | (Param extends `${infer P}(${string}` ? P : Param)
        | ExtractPathParams<`/${Rest}`>
    : T extends `${string}:${infer Param}`
      ? Param extends `${infer P}(${string}`
        ? P
        : Param
      : never;

/**
 * Creates an object type where keys are the extracted path parameter names
 * and values are strings (the resolved $paramName values).
 */
type PathParams<T extends string> = {
  [K in ExtractPathParams<T>]: string;
};

/**
 * Helper function to reference a Vercel project environment variable.
 * These are placeholders that get resolved at request time by Vercel's routing layer.
 * They are set per-deployment and don't change until you redeploy.
 *
 * @example
 * // Usage in rewrites with type-safe path params:
 * routes.rewrite('/users/:userId', 'https://api.example.com/$1', ({ userId }) => ({
 *   requestHeaders: {
 *     'x-user-id': userId,
 *     'authorization': `Bearer ${deploymentEnv('API_KEY')}`
 *   }
 * }))
 */
export function deploymentEnv(name: string): string {
  return `$${name}`;
}

/**
 * Template literal type for durations recognized by pretty-cache-header.
 *
 * Usage examples: '10s', '1week', '2months', '12hrs'
 */
export type TimeUnit =
  | 'ms'
  | 'milli'
  | 'millisecond'
  | 'milliseconds'
  | 's'
  | 'sec'
  | 'secs'
  | 'second'
  | 'seconds'
  | 'm'
  | 'min'
  | 'mins'
  | 'minute'
  | 'minutes'
  | 'h'
  | 'hr'
  | 'hrs'
  | 'hour'
  | 'hours'
  | 'd'
  | 'day'
  | 'days'
  | 'w'
  | 'week'
  | 'weeks'
  | 'mon'
  | 'mth'
  | 'mths'
  | 'month'
  | 'months'
  | 'y'
  | 'yr'
  | 'yrs'
  | 'year'
  | 'years';

export type TimeString = `${number}${TimeUnit}`;

/**
 * Options for constructing the Cache-Control header.
 * All fields are optional; set only what you need.
 */
export interface CacheOptions {
  /**
   * Indicates that the response can be cached by any cache.
   * Equivalent to "public" in Cache-Control.
   */
  public?: true;
  /**
   * Indicates that the response is intended for a single user
   * and must not be stored by a shared cache.
   */
  private?: true;
  /**
   * Indicates that the resource will not be updated and,
   * therefore, does not need revalidation.
   */
  immutable?: true;
  /**
   * Indicates that a response must not be stored in any cache.
   */
  noStore?: true;
  /**
   * Indicates that the response cannot be used to satisfy a subsequent request
   * without validation on the origin server.
   */
  noCache?: true;
  /**
   * Indicates that the client must revalidate the response with the origin server
   * before using it again.
   */
  mustRevalidate?: true;
  /**
   * Same as must-revalidate, but specifically for shared caches.
   */
  proxyRevalidate?: true;
  /**
   * The maximum amount of time a resource is considered fresh.
   * e.g. '1week', '30s', '3days'.
   */
  maxAge?: TimeString;
  /**
   * If s-maxage is present in a response, it takes priority over max-age
   * when a shared cache (e.g., CDN) is satisfied.
   */
  sMaxAge?: TimeString;
  /**
   * How long (in seconds) a resource remains fresh (beyond its max-age)
   * while a background revalidation is attempted.
   */
  staleWhileRevalidate?: TimeString;
  /**
   * Allows clients to use stale data when an error is encountered
   * while attempting to revalidate.
   */
  staleIfError?: TimeString;
}

/**
 * Condition type for matching in redirects, headers, and rewrites.
 * - 'header': Match if a specific HTTP header key/value is present (or missing).
 * - 'cookie': Match if a specific cookie is present (or missing).
 * - 'host':   Match if the incoming host matches a given pattern.
 * - 'query':  Match if a query parameter is present (or missing).
 * - 'path':   Match if the path matches a given pattern.
 */
export type ConditionType = 'header' | 'cookie' | 'host' | 'query' | 'path';

/**
 * Conditional matching operators for has/missing conditions.
 * These can be used with the value field to perform advanced matching.
 */
export interface ConditionOperators {
  /** Check equality on a value (exact match) */
  eq?: string | number;
  /** Check inequality on a value (not equal) */
  neq?: string;
  /** Check inclusion in an array of values (value is one of) */
  inc?: string[];
  /** Check non-inclusion in an array of values (value is not one of) */
  ninc?: string[];
  /** Check if value starts with a prefix */
  pre?: string;
  /** Check if value ends with a suffix */
  suf?: string;
  /** Check if value is greater than (numeric comparison) */
  gt?: number;
  /** Check if value is greater than or equal to */
  gte?: number;
  /** Check if value is less than (numeric comparison) */
  lt?: number;
  /** Check if value is less than or equal to */
  lte?: number;
}

/**
 * Used to define "has" or "missing" conditions with advanced matching operators.
 *
 * @example
 * // Simple header presence check
 * { type: 'header', key: 'x-api-key' }
 *
 * @example
 * // Header with exact value match
 * { type: 'header', key: 'x-api-version', value: 'v2' }
 *
 * @example
 * // Header with conditional operators
 * { type: 'header', key: 'x-user-role', inc: ['admin', 'moderator'] }
 *
 * @example
 * // Cookie with prefix matching
 * { type: 'cookie', key: 'session', pre: 'prod-' }
 *
 * @example
 * // Host matching
 * { type: 'host', value: 'api.example.com' }
 *
 * @example
 * // Query parameter with numeric comparison
 * { type: 'query', key: 'version', gte: 2 }
 *
 * @example
 * // Path pattern matching
 * { type: 'path', value: '^/api/v[0-9]+/.*' }
 */
export interface Condition extends ConditionOperators {
  type: ConditionType;
  /** The key to match. Not used for 'host' or 'path' types. */
  key?: string;
  /**
   * Simple string/regex pattern to match against.
   * For 'host' and 'path' types, this is the only matching option.
   * For other types, you can use value OR the conditional operators (eq, neq, etc).
   */
  value?: string;
}

/**
 * Transform type specifies the scope of what the transform will apply to.
 * - 'request.query': Transform query parameters in the request
 * - 'request.headers': Transform headers in the request
 * - 'response.headers': Transform headers in the response
 */
export type TransformType =
  | 'request.query'
  | 'request.headers'
  | 'response.headers';

/**
 * Transform operation type.
 * - 'set': Sets the key and value if missing
 * - 'append': Appends args to the value of the key, and will set if missing
 * - 'delete': Deletes the key entirely if args is not provided; otherwise, it will delete the value of args from the matching key
 */
export type TransformOp = 'set' | 'append' | 'delete';

/**
 * Conditional matching properties for transform keys.
 * When the key property is an object, it can contain one or more of these properties.
 */
export interface TransformKeyConditions {
  /** Check equality on a value */
  eq?: string | number;
  /** Check inequality on a value */
  neq?: string;
  /** Check inclusion in an array of values */
  inc?: string[];
  /** Check non-inclusion in an array of values */
  ninc?: string[];
  /** Check if value starts with a prefix */
  pre?: string;
  /** Check if value ends with a suffix */
  suf?: string;
  /** Check if value is greater than */
  gt?: number;
  /** Check if value is greater than or equal to */
  gte?: number;
  /** Check if value is less than */
  lt?: number;
  /** Check if value is less than or equal to */
  lte?: number;
}

/**
 * Transform target specifies what key to target for the transform.
 * The key can be a string (exact match) or an object with conditional matching.
 */
export interface TransformTarget {
  key: string | TransformKeyConditions;
}

/**
 * Transform defines a single transformation operation on request or response data.
 * Supports environment variables (e.g., $BEARER_TOKEN) and path parameters (e.g., $userId).
 */
export interface Transform {
  /** The scope of what the transform will apply to */
  type: TransformType;
  /** The operation to perform */
  op: TransformOp;
  /** The target key to transform */
  target: TransformTarget;
  /** The value(s) to use for the operation. Can include environment variables ($VAR) and path parameters ($param) */
  args?: string | string[];
  /** List of environment variable names that are used in args (without the $ prefix) */
  env?: string[];
}

/**
 * Route defines a routing rule with transforms.
 * This is the newer, more powerful route format that supports transforms.
 *
 * @example
 * {
 *   src: "/users/:userId/posts/:postId",
 *   transforms: [
 *     {
 *       type: "request.headers",
 *       op: "set",
 *       target: { key: "x-user-id" },
 *       args: "$userId"
 *     },
 *     {
 *       type: "request.headers",
 *       op: "set",
 *       target: { key: "authorization" },
 *       args: "Bearer $BEARER_TOKEN"
 *     }
 *   ]
 * }
 */
export interface Route {
  /** Pattern to match request paths using path-to-regexp syntax */
  src: string;
  /** Optional destination for rewrite/redirect */
  dest?: string;
  /** Array of HTTP methods to match. If not provided, matches all methods */
  methods?: string[];
  /** Array of transforms to apply */
  transforms?: Transform[];
  /** Optional conditions that must be present */
  has?: Condition[];
  /** Optional conditions that must be absent */
  missing?: Condition[];
  /** If true, this is a redirect (status defaults to 308 or specified) */
  redirect?: boolean;
  /** Status code for the response */
  status?: number;
  /** Headers to set (alternative to using transforms) */
  headers?: Record<string, string>;
  /** Environment variables referenced in dest or transforms */
  env?: string[];
  /**
   * When true (default), external rewrites will respect the Cache-Control header from the origin.
   * When false, caching is disabled for this rewrite.
   */
  respectOriginCacheControl?: boolean;
}

/**
 * Represents a single HTTP header key/value pair.
 */
export interface Header {
  key: string;
  value: string;
}

/**
 * Options for transform operations on headers and query parameters.
 * These are converted internally to Vercel's transforms format.
 */
export interface TransformOptions {
  /**
   * Headers to set/modify on the incoming request.
   * Sets the key and value if missing.
   *
   * @example
   * requestHeaders: {
   *   'x-user-id': userId,
   *   'authorization': `Bearer ${env.API_TOKEN}`
   * }
   */
  requestHeaders?: Record<string, string | string[]>;

  /**
   * Headers to set/modify on the outgoing response.
   * Sets the key and value if missing.
   *
   * @example
   * responseHeaders: {
   *   'x-post-id': postId
   * }
   */
  responseHeaders?: Record<string, string | string[]>;

  /**
   * Query parameters to set/modify on the request.
   * Sets the key and value if missing.
   *
   * @example
   * requestQuery: {
   *   'theme': 'dark'
   * }
   */
  requestQuery?: Record<string, string | string[]>;

  /**
   * Headers to append to the incoming request.
   * Appends args to the value of the key, and will set if missing.
   *
   * @example
   * appendRequestHeaders: {
   *   'x-custom': 'value'
   * }
   */
  appendRequestHeaders?: Record<string, string | string[]>;

  /**
   * Headers to append to the outgoing response.
   * Appends args to the value of the key, and will set if missing.
   *
   * @example
   * appendResponseHeaders: {
   *   'x-custom': 'value'
   * }
   */
  appendResponseHeaders?: Record<string, string | string[]>;

  /**
   * Query parameters to append to the request.
   * Appends args to the value of the key, and will set if missing.
   *
   * @example
   * appendRequestQuery: {
   *   'tag': 'value'
   * }
   */
  appendRequestQuery?: Record<string, string | string[]>;

  /**
   * Headers to delete from the incoming request.
   * Deletes the key entirely if args is not provided; otherwise, it will delete the value of args from the matching key.
   *
   * @example
   * deleteRequestHeaders: ['x-remove-this', 'x-remove-that']
   */
  deleteRequestHeaders?: string[];

  /**
   * Headers to delete from the outgoing response.
   * Deletes the key entirely if args is not provided; otherwise, it will delete the value of args from the matching key.
   *
   * @example
   * deleteResponseHeaders: ['x-powered-by']
   */
  deleteResponseHeaders?: string[];

  /**
   * Query parameters to delete from the request.
   * Deletes the key entirely if args is not provided; otherwise, it will delete the value of args from the matching key.
   *
   * @example
   * deleteRequestQuery: ['debug', 'trace']
   */
  deleteRequestQuery?: string[];
}

/**
 * HeaderRule defines one or more headers to set for requests
 * matching a given source pattern, plus optional "has" / "missing" conditions.
 */
export interface HeaderRule {
  /**
   * Pattern to match request paths using path-to-regexp syntax.
   * @example
   * "/api/(.*)"           // Basic capture group
   * "/blog/:slug"         // Named parameter
   * "/feedback/((?!general).*)" // Negative lookahead in a group
   */
  source: string;
  /** An array of key/value pairs to set as headers. */
  headers: Header[];
  /** Optional conditions that must be present. */
  has?: Condition[];
  /** Optional conditions that must be absent. */
  missing?: Condition[];
}

/**
 * RedirectRule defines a URL rewrite in which the user is redirected
 * (3xx response) to a destination, with optional conditions.
 */
export interface RedirectRule {
  /**
   * Pattern to match request paths using path-to-regexp syntax.
   * @example
   * "/api/(.*)"           // Basic capture group
   * "/blog/:slug"         // Named parameter
   * "/feedback/((?!general).*)" // Negative lookahead in a group
   */
  source: string;
  destination: string;
  /**
   * If true, default status code is 308; if false, 307.
   * Can be overridden by `statusCode`.
   */
  permanent?: boolean;
  /**
   * Allows specifying a custom HTTP status code instead of 307 or 308.
   */
  statusCode?: number;
  has?: Condition[];
  missing?: Condition[];
}

/**
 * RewriteRule defines an internal rewrite from the source pattern
 * to the specified destination, without exposing a redirect to the user.
 */
export interface RewriteRule {
  /**
   * Pattern to match request paths using path-to-regexp syntax.
   * @example
   * "/api/(.*)"           // Basic capture group
   * "/blog/:slug"         // Named parameter
   * "/feedback/((?!general).*)" // Negative lookahead in a group
   */
  source: string;
  destination: string;
  /** Array of HTTP methods to match. If not provided, matches all methods */
  methods?: string[];
  /** Status code for the response */
  status?: number;
  has?: Condition[];
  missing?: Condition[];
  /** Internal field: transforms generated from requestHeaders/responseHeaders/requestQuery */
  transforms?: Transform[];
  /**
   * When true (default), external rewrites will respect the Cache-Control header from the origin.
   * When false, caching is disabled for this rewrite.
   */
  respectOriginCacheControl?: boolean;
}

/**
 * CronRule defines a scheduled function invocation on Vercel.
 */
export interface CronRule {
  /**
   * The URL path to invoke, must start with '/'.
   */
  path: string;
  /**
   * Cron expression string (e.g., '0 0 * * *' for daily midnight).
   */
  schedule: string;
}

/**
 * Providers can be used to asynchronously load sets of rules.
 */
export type RedirectProvider = () => Promise<RedirectRule[]>;
export type HeaderProvider = () => Promise<HeaderRule[]>;
export type RewriteProvider = () => Promise<RewriteRule[]>;
export type CronProvider = () => Promise<CronRule[]>;

/**
 * The aggregated router configuration, suitable for exporting as
 * a JSON or TypeScript object that can be consumed by Vercel.
 */
export interface RouterConfig {
  redirects?: RedirectRule[];
  headers?: HeaderRule[];
  rewrites?: RewriteRule[];
  /**
   * Array of routes with transforms support.
   * This is the newer, more powerful routing format.
   * When routes is present, other fields (redirects, headers, rewrites, crons) are excluded.
   */
  routes?: Route[];
  /**
   * Array of cron definitions for scheduled invocations.
   */
  crons?: CronRule[];
}

/**
 * Extract environment variable names from a string or array of strings
 * Returns env var names without the $ prefix, excluding path parameters
 */
function extractEnvVars(
  args: string | string[] | undefined,
  pathParams: string[]
): string[] {
  if (!args) return [];

  const envVars = new Set<string>();
  const argsArray = Array.isArray(args) ? args : [args];

  for (const arg of argsArray) {
    // Find all $VAR patterns
    const matches = arg.match(/\$([A-Z_][A-Z0-9_]*)/g);
    if (matches) {
      for (const match of matches) {
        const varName = match.substring(1); // Remove the $
        // Only add if it's not a path parameter
        if (!pathParams.includes(varName)) {
          envVars.add(varName);
        }
      }
    }
  }

  return Array.from(envVars);
}

/**
 * The main Router class for building a Vercel configuration object in code.
 * Supports synchronous or asynchronous addition of rewrites, redirects, headers,
 * plus convenience methods for crons, caching, and more.
 */
export class Router {
  private redirectRules: RedirectRule[] = [];
  private headerRules: HeaderRule[] = [];
  private rewriteRules: RewriteRule[] = [];
  private routeRules: Route[] = [];
  private cronRules: CronRule[] = [];

  /**
   * Helper to extract path parameter names from a source pattern.
   * Path parameters are identified by :paramName syntax.
   * @example
   * extractPathParams('/users/:userId/posts/:postId') // Returns ['userId', 'postId']
   */
  private extractPathParams(source: string): string[] {
    const params: string[] = [];
    const matches = source.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
    for (const match of matches) {
      params.push(match[1]);
    }
    return params;
  }

  /**
   * Creates a rewrite rule. Returns either a Rewrite object (simple case) or Route with transforms.
   *
   * @example
   *    // Simple rewrite
   *    router.rewrite('/api/(.*)', 'https://old-on-prem.com/$1')
   *
   *    // With transforms but no path params
   *    router.rewrite('/(.*)', 'https://api.example.com/$1', {
   *      requestHeaders: {
   *        'authorization': `Bearer ${deploymentEnv('API_KEY')}`
   *      }
   *    })
   *
   *    // With type-safe path params
   *    router.rewrite('/users/:userId', 'https://api.example.com/users/$1', ({ userId }) => ({
   *      requestHeaders: {
   *        'x-user-id': userId,
   *        'authorization': `Bearer ${deploymentEnv('API_KEY')}`
   *      }
   *    }))
   *
   *    // With conditions only
   *    router.rewrite('/admin/(.*)', 'https://admin.example.com/$1', {
   *      has: [{ type: 'header', key: 'x-admin-token' }]
   *    })
   * @internal Can return Route with transforms internally
   */
  rewrite<T extends string>(source: T, destination: string): Rewrite | Route;
  rewrite<T extends string>(
    source: T,
    destination: string,
    callback: (params: PathParams<T>) => {
      has?: Condition[];
      missing?: Condition[];
      requestHeaders?: Record<string, string | string[]>;
      responseHeaders?: Record<string, string | string[]>;
      requestQuery?: Record<string, string | string[]>;
      respectOriginCacheControl?: boolean;
    }
  ): Rewrite | Route;
  rewrite<T extends string>(
    source: T,
    destination: string,
    options: {
      has?: Condition[];
      missing?: Condition[];
      requestHeaders?: Record<string, string | string[]>;
      responseHeaders?: Record<string, string | string[]>;
      requestQuery?: Record<string, string | string[]>;
      respectOriginCacheControl?: boolean;
    } & Record<never, never> // Make this structurally distinct from functions
  ): Rewrite | Route;
  public rewrite<T extends string>(
    source: T,
    destination: string,
    optionsOrCallback?:
      | {
          has?: Condition[];
          missing?: Condition[];
          requestHeaders?: Record<string, string | string[]>;
          responseHeaders?: Record<string, string | string[]>;
          requestQuery?: Record<string, string | string[]>;
          respectOriginCacheControl?: boolean;
        }
      | ((params: PathParams<T>) => {
          has?: Condition[];
          missing?: Condition[];
          requestHeaders?: Record<string, string | string[]>;
          responseHeaders?: Record<string, string | string[]>;
          requestQuery?: Record<string, string | string[]>;
          respectOriginCacheControl?: boolean;
        })
  ): Rewrite | Route {
    this.validateSourcePattern(source);

    let options:
      | {
          has?: Condition[];
          missing?: Condition[];
          requestHeaders?: Record<string, string | string[]>;
          responseHeaders?: Record<string, string | string[]>;
          requestQuery?: Record<string, string | string[]>;
          respectOriginCacheControl?: boolean;
        }
      | undefined;

    if (typeof optionsOrCallback === 'function') {
      const pathParams = this.extractPathParams(source);
      const paramsObj: Record<string, string> = {};
      for (const param of pathParams) {
        paramsObj[param] = `$${param}`;
      }
      options = optionsOrCallback(paramsObj as PathParams<T>);
    } else {
      options = optionsOrCallback;
    }

    const {
      has,
      missing,
      requestHeaders,
      responseHeaders,
      requestQuery,
      respectOriginCacheControl,
    } = options || {};

    // Check if any transforms were provided
    const hasTransforms = requestHeaders || responseHeaders || requestQuery;

    if (hasTransforms) {
      // Build a Route object with transforms
      const transforms: Transform[] = [];
      const pathParams = this.extractPathParams(source);

      if (requestHeaders) {
        for (const [key, value] of Object.entries(requestHeaders)) {
          const transform: Transform = {
            type: 'request.headers',
            op: 'set',
            target: { key },
            args: value,
          };
          const envVars = extractEnvVars(value, pathParams);
          if (envVars.length > 0) {
            transform.env = envVars;
          }
          transforms.push(transform);
        }
      }

      if (responseHeaders) {
        for (const [key, value] of Object.entries(responseHeaders)) {
          const transform: Transform = {
            type: 'response.headers',
            op: 'set',
            target: { key },
            args: value,
          };
          const envVars = extractEnvVars(value, pathParams);
          if (envVars.length > 0) {
            transform.env = envVars;
          }
          transforms.push(transform);
        }
      }

      if (requestQuery) {
        for (const [key, value] of Object.entries(requestQuery)) {
          const transform: Transform = {
            type: 'request.query',
            op: 'set',
            target: { key },
            args: value,
          };
          const envVars = extractEnvVars(value, pathParams);
          if (envVars.length > 0) {
            transform.env = envVars;
          }
          transforms.push(transform);
        }
      }

      const route: Route = {
        src: source,
        dest: destination,
        transforms,
      };
      if (has) route.has = has;
      if (missing) route.missing = missing;
      if (respectOriginCacheControl !== undefined)
        route.respectOriginCacheControl = respectOriginCacheControl;

      // Extract env vars from destination
      const destEnvVars = extractEnvVars(destination, pathParams);
      if (destEnvVars.length > 0) {
        route.env = destEnvVars;
      }

      return route;
    }

    // Simple rewrite without transforms - check if destination has env vars
    const pathParams = this.extractPathParams(source);
    const destEnvVars = extractEnvVars(destination, pathParams);

    if (destEnvVars.length > 0) {
      // Need Route format to include env field
      const route: Route = {
        src: source,
        dest: destination,
        env: destEnvVars,
      };
      if (has) route.has = has;
      if (missing) route.missing = missing;
      if (respectOriginCacheControl !== undefined)
        route.respectOriginCacheControl = respectOriginCacheControl;
      return route;
    }

    // Simple rewrite without transforms or env vars
    const rewrite: Rewrite = {
      source,
      destination,
    };

    if (has) rewrite.has = has;
    if (missing) rewrite.missing = missing;
    if (respectOriginCacheControl !== undefined)
      rewrite.respectOriginCacheControl = respectOriginCacheControl;

    return rewrite;
  }

  /**
   * Creates a redirect rule. Returns either a Redirect object (simple case) or Route with transforms.
   *
   * @example
   *    // Simple redirect
   *    router.redirect('/old-path', '/new-path', { permanent: true })
   *
   *    // With transforms but no path params
   *    router.redirect('/old', '/new', {
   *      permanent: true,
   *      requestHeaders: {
   *        'x-api-key': deploymentEnv('API_KEY')
   *      }
   *    })
   *
   *    // With type-safe path params
   *    router.redirect('/users/:userId', '/new-users/$1', ({ userId }) => ({
   *      permanent: true,
   *      requestHeaders: {
   *        'x-user-id': userId,
   *        'x-api-key': deploymentEnv('API_KEY')
   *      }
   *    }))
   *
   *    // With conditions only
   *    router.redirect('/dashboard/(.*)', '/login', {
   *      missing: [{ type: 'cookie', key: 'auth-token' }]
   *    })
   * @internal Can return Route with transforms internally
   */
  public redirect<T extends string>(
    source: T,
    destination: string
  ): Redirect | Route;
  public redirect<T extends string>(
    source: T,
    destination: string,
    callback: (params: PathParams<T>) => {
      permanent?: boolean;
      statusCode?: number;
      has?: Condition[];
      missing?: Condition[];
      requestHeaders?: Record<string, string | string[]>;
    }
  ): Redirect | Route;
  public redirect<T extends string>(
    source: T,
    destination: string,
    options: {
      permanent?: boolean;
      statusCode?: number;
      has?: Condition[];
      missing?: Condition[];
      requestHeaders?: Record<string, string | string[]>;
    }
  ): Redirect | Route;
  public redirect<T extends string>(
    source: T,
    destination: string,
    optionsOrCallback?:
      | {
          permanent?: boolean;
          statusCode?: number;
          has?: Condition[];
          missing?: Condition[];
          requestHeaders?: Record<string, string | string[]>;
        }
      | ((params: PathParams<T>) => {
          permanent?: boolean;
          statusCode?: number;
          has?: Condition[];
          missing?: Condition[];
          requestHeaders?: Record<string, string | string[]>;
        })
  ): Redirect | Route {
    this.validateSourcePattern(source);

    let options:
      | {
          permanent?: boolean;
          statusCode?: number;
          has?: Condition[];
          missing?: Condition[];
          requestHeaders?: Record<string, string | string[]>;
        }
      | undefined;

    if (typeof optionsOrCallback === 'function') {
      const pathParams = this.extractPathParams(source);
      const paramsObj: Record<string, string> = {};
      for (const param of pathParams) {
        paramsObj[param] = `$${param}`;
      }
      options = optionsOrCallback(paramsObj as PathParams<T>);
    } else {
      options = optionsOrCallback;
    }

    const { permanent, statusCode, has, missing, requestHeaders } =
      options || {};

    // Check if transforms were provided
    if (requestHeaders) {
      // Build a Route object with transforms
      const transforms: Transform[] = [];
      const pathParams = this.extractPathParams(source);

      for (const [key, value] of Object.entries(requestHeaders)) {
        const transform: Transform = {
          type: 'request.headers',
          op: 'set',
          target: { key },
          args: value,
        };
        const envVars = extractEnvVars(value, pathParams);
        if (envVars.length > 0) {
          transform.env = envVars;
        }
        transforms.push(transform);
      }

      const route: Route = {
        src: source,
        dest: destination,
        redirect: true,
        status: statusCode || (permanent ? 308 : 307),
        transforms,
      };
      if (has) route.has = has;
      if (missing) route.missing = missing;

      // Extract env vars from destination
      const destEnvVars = extractEnvVars(destination, pathParams);
      if (destEnvVars.length > 0) {
        route.env = destEnvVars;
      }

      return route;
    }

    // Simple redirect without transforms - check if destination has env vars
    const pathParams = this.extractPathParams(source);
    const destEnvVars = extractEnvVars(destination, pathParams);

    if (destEnvVars.length > 0) {
      // Need Route format to include env field
      const route: Route = {
        src: source,
        dest: destination,
        redirect: true,
        status: statusCode || (permanent ? 308 : 307),
        env: destEnvVars,
      };
      if (has) route.has = has;
      if (missing) route.missing = missing;
      return route;
    }

    // Simple redirect without transforms or env vars
    const redirect: Redirect = {
      source,
      destination,
    };

    if (permanent !== undefined) redirect.permanent = permanent;
    if (statusCode !== undefined) redirect.statusCode = statusCode;
    if (has) redirect.has = has;
    if (missing) redirect.missing = missing;

    return redirect;
  }

  /**
   * Creates a header rule matching the vercel.json schema.
   * @example
   *    router.header('/api/(.*)', [{ key: 'X-Custom', value: 'HelloWorld' }])
   */
  public header(
    source: string,
    headers: Header[],
    options?: { has?: Condition[]; missing?: Condition[] }
  ): {
    source: string;
    headers: Header[];
    has?: Condition[];
    missing?: Condition[];
  } {
    this.validateSourcePattern(source);
    return { source, headers, ...options };
  }

  /**
   * Creates a Cache-Control header rule, leveraging `pretty-cache-header`.
   * Returns a HeaderRule matching the vercel.json schema.
   *
   * @example
   *    router.cacheControl('/my-page', {
   *      public: true,
   *      maxAge: '1week',
   *      staleWhileRevalidate: '1year'
   *    })
   */
  public cacheControl(
    source: string,
    cacheOptions: CacheOptions,
    options?: { has?: Condition[]; missing?: Condition[] }
  ): {
    source: string;
    headers: Header[];
    has?: Condition[];
    missing?: Condition[];
  } {
    this.validateSourcePattern(source);
    const value = cacheHeader(cacheOptions);
    return {
      source,
      headers: [{ key: 'Cache-Control', value }],
      ...options,
    };
  }

  /**
   * Adds a route with transforms support.
   * This is the newer, more powerful routing format that supports transforms.
   *
   * @example
   *    // Add a route with transforms for path parameters and environment variables
   *    router.route({
   *      src: '/users/:userId/posts/:postId',
   *      dest: 'https://api.example.com/users/$userId/posts/$postId',
   *      transforms: [
   *        {
   *          type: 'request.headers',
   *          op: 'set',
   *          target: { key: 'x-user-id' },
   *          args: '$userId'
   *        },
   *        {
   *          type: 'request.headers',
   *          op: 'set',
   *          target: { key: 'authorization' },
   *          args: 'Bearer $BEARER_TOKEN'
   *        }
   *      ]
   *    });
   */
  public route(config: Route): this {
    this.validateSourcePattern(config.src);

    // Auto-extract env vars from each transform if not already specified
    if (config.transforms) {
      const pathParams = this.extractPathParams(config.src);
      for (const transform of config.transforms) {
        if (!transform.env && transform.args) {
          const envVars = extractEnvVars(transform.args, pathParams);
          if (envVars.length > 0) {
            transform.env = envVars;
          }
        }
      }
    }

    this.routeRules.push(config);
    return this;
  }

  /**
   * Adds a single cron rule (synchronous).
   */
  public cron(path: string, schedule: string): this {
    this.validateCronExpression(schedule);
    this.cronRules.push({ path, schedule });
    return this;
  }

  /**
   * Loads cron rules asynchronously and appends them.
   */
  public async crons(provider: CronProvider): Promise<this> {
    const rules = await provider();
    this.cronRules.push(...rules);
    return this;
  }

  /**
   * Returns the complete router configuration.
   * Typically, you'll export or return this in your build scripts,
   * so that Vercel can pick it up.
   */
  public getConfig(): RouterConfig {
    // Separate rewrites into those that need to be routes vs. legacy rewrites
    // Routes are needed for: transforms, methods, or custom status
    const rewritesNeedingRoutes = this.rewriteRules.filter(
      r => r.transforms || r.methods || r.status
    );
    const legacyRewrites = this.rewriteRules.filter(
      r => !r.transforms && !r.methods && !r.status
    );

    // Convert rewrites to routes
    const routesFromRewrites: Route[] = rewritesNeedingRoutes.map(rewrite => {
      const route: Route = {
        src: rewrite.source,
        dest: rewrite.destination,
      };
      if (rewrite.transforms) route.transforms = rewrite.transforms;
      if (rewrite.methods) route.methods = rewrite.methods;
      if (rewrite.status) route.status = rewrite.status;
      if (rewrite.has) route.has = rewrite.has;
      if (rewrite.missing) route.missing = rewrite.missing;
      return route;
    });

    // Combine with existing routes
    const allRoutes = [...routesFromRewrites, ...this.routeRules];

    // If routes exist, convert everything to routes format
    // Vercel doesn't allow mixing routes with redirects, rewrites, headers, cleanUrls, or trailingSlash
    if (allRoutes.length > 0) {
      // Convert standalone redirects to routes
      const routesFromRedirects: Route[] = this.redirectRules.map(
        redirectRule => {
          const route: Route = {
            src: redirectRule.source,
            dest: redirectRule.destination,
            redirect: true,
            status:
              redirectRule.statusCode || (redirectRule.permanent ? 308 : 307),
          };
          if (redirectRule.has) route.has = redirectRule.has;
          if (redirectRule.missing) route.missing = redirectRule.missing;
          return route;
        }
      );

      // Convert legacy rewrites (without transforms) to routes
      const routesFromLegacyRewrites: Route[] = legacyRewrites.map(rewrite => {
        const route: Route = {
          src: rewrite.source,
          dest: rewrite.destination,
        };
        if (rewrite.has) route.has = rewrite.has;
        if (rewrite.missing) route.missing = rewrite.missing;
        return route;
      });

      // Convert standalone headers to routes (except rewrite caching headers)
      const routesFromHeaders: Route[] = this.headerRules
        .filter(rule => {
          // Exclude rewrite caching headers (they're automatically added for rewrites)
          const isCachingHeader =
            rule.headers.length === 1 &&
            rule.headers[0].key === 'x-vercel-enable-rewrite-caching';
          return !isCachingHeader;
        })
        .map(headerRule => {
          const transforms: Transform[] = headerRule.headers.map(header => ({
            type: 'response.headers' as TransformType,
            op: 'set' as TransformOp,
            target: { key: header.key },
            args: header.value,
          }));

          const route: Route = {
            src: headerRule.source,
            transforms,
          };
          if (headerRule.has) route.has = headerRule.has;
          if (headerRule.missing) route.missing = headerRule.missing;
          return route;
        });

      // Combine all routes: redirects, legacy rewrites, rewrites with transforms, explicit routes, and headers as routes
      const combinedRoutes = [
        ...routesFromRedirects,
        ...routesFromLegacyRewrites,
        ...routesFromRewrites,
        ...this.routeRules,
        ...routesFromHeaders,
      ];

      const config: RouterConfig = {
        routes: combinedRoutes,
      };

      // NOTE: crons are now handled via export const crons in vercel.ts
      // They are no longer included in router.getConfig()

      return config;
    }

    // Otherwise, return the legacy format
    const config: RouterConfig = {
      redirects: this.redirectRules,
      headers: this.headerRules,
      rewrites: legacyRewrites,
      // NOTE: crons are now handled via export const crons in vercel.ts
    };

    return config;
  }

  /**
   * Visualizes the routing tree in the order that Vercel applies routes.
   * Returns a formatted string showing the routing hierarchy.
   */
  public visualize(): string {
    const tree = [
      {
        type: 'Headers',
        rules: this.headerRules,
      },
      {
        type: 'Redirects',
        rules: this.redirectRules,
      },
      {
        type: 'Before Filesystem Rewrites',
        rules: this.rewriteRules.filter(
          rewrite =>
            rewrite.source.startsWith('/api/') ||
            rewrite.source.startsWith('/_next/')
        ),
      },
      {
        type: 'Filesystem',
        rules: [], // This would be populated by Vercel's filesystem routing
      },
      {
        type: 'After Filesystem Rewrites',
        rules: this.rewriteRules.filter(
          rewrite =>
            !rewrite.source.startsWith('/api/') &&
            !rewrite.source.startsWith('/_next/') &&
            rewrite.source !== '/(.*)'
        ),
      },
      {
        type: 'Fallback Rewrites',
        rules: this.rewriteRules.filter(rewrite => rewrite.source === '/(.*)'),
      },
    ];

    return tree
      .map(node => {
        const rules =
          node.rules.length > 0
            ? node.rules
                .map(rule => {
                  if ('headers' in rule) {
                    const headersStr = rule.headers
                      .map(h => `${h.key}: ${h.value}`)
                      .join(', ');
                    return `  ${rule.source} [${headersStr}]`;
                  }
                  if ('destination' in rule) {
                    return `  ${rule.source} → ${rule.destination}`;
                  }
                  // @ts-ignore
                  return `  ${rule.source}`;
                })
                .join('\n')
            : '  (empty)';

        return `${node.type}:\n${rules}`;
      })
      .join('\n\n');
  }

  private validateSourcePattern(source: string): void {
    validateRegexPattern(source);
  }

  private validateCronExpression(schedule: string): void {
    parseCronExpression(schedule);
  }
}

/**
 * A simple factory function for creating a new Router instance.
 * @example
 *   import { createRoutes } from '@vercel/router-sdk';
 *   const routes = createRoutes();
 */
export function createRoutes(): Router {
  return new Router();
}

/**
 * Default singleton router instance for convenience.
 * @example
 *   import { routes } from '@vercel/router-sdk';
 *   routes.redirect('/old', '/new');
 */
export const routes = new Router();
