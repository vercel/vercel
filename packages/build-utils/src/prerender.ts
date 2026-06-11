import type { File, HasField, Chain } from './types';
import { Lambda } from './lambda';

function assertOptionalBoolean(
  value: unknown,
  name: string
): asserts value is boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new Error(
      `The \`${name}\` argument for \`Prerender\` must be a boolean or undefined.`
    );
  }
}

interface PrerenderOptions {
  expiration: number | false;
  staleExpiration?: number;
  lambda?: Lambda;
  fallback: File | null;
  group?: number;
  bypassToken?: string | null /* optional to be non-breaking change */;
  allowQuery?: string[];
  allowHeader?: string[];
  initialHeaders?: Record<string, string>;
  initialStatus?: number;
  passQuery?: boolean;
  sourcePath?: string;
  experimentalBypassFor?: HasField;
  experimentalStreamingLambdaPath?: string;
  chain?: Chain;
  exposeErrBody?: boolean;
  partialFallback?: boolean;
  hasPostponed?: boolean;
  hasFallback?: boolean;
  htmlSize?: number;
  isDynamicRoute?: boolean;
}

export class Prerender {
  public type: 'Prerender';
  /**
   * `expiration` is `revalidate` in Next.js terms, and `s-maxage` in
   * `cache-control` terms.
   */
  public expiration: number | false;
  /**
   * `staleExpiration` is `expire` in Next.js terms, and
   * `stale-while-revalidate` + `s-maxage` in `cache-control` terms. It's
   * expected to be undefined if `expiration` is `false`.
   */
  public staleExpiration?: number;
  public lambda?: Lambda;
  public fallback: File | null;
  public group?: number;
  public bypassToken: string | null;
  public allowQuery?: string[];
  public allowHeader?: string[];
  public initialHeaders?: Record<string, string>;
  public initialStatus?: number;
  public passQuery?: boolean;
  public sourcePath?: string;
  public experimentalBypassFor?: HasField;
  public experimentalStreamingLambdaPath?: string;
  public chain?: Chain;
  public exposeErrBody?: boolean;
  public partialFallback?: boolean;
  /**
   * Set to `true` when the route's `.meta` postponed state is present (React
   * suspended during build prerender). `false` when the framework prerendered
   * a Prerender route without postponing. `undefined` when the framework did
   * not provide the signal.
   */
  public hasPostponed?: boolean;
  /**
   * `true` when the route's dynamic template had a static fallback page (the
   * prerender-manifest `fallback` was a string). `false` for blocking/omitted
   * dynamic templates (manifest `fallback` was `null`/`false`). `undefined` for
   * concrete prerenders, where the notion of a fallback doesn't apply.
   */
  public hasFallback?: boolean;
  /**
   * Byte size on disk of the route's prerendered `.html` shell. `0` for an
   * empty shell (PPR template that postponed everything). `undefined` when
   * there's no `.html` on disk (pages router, route handlers, edge).
   */
  public htmlSize?: number;
  /**
   * `true` when this entry came from a dynamic route template (the
   * prerender-manifest `dynamicRoutes` section: fallback, blocking, or omitted)
   * rather than a concrete prerender.
   */
  public isDynamicRoute?: boolean;

  constructor({
    expiration,
    staleExpiration,
    lambda,
    fallback,
    group,
    bypassToken,
    allowQuery,
    allowHeader,
    initialHeaders,
    initialStatus,
    passQuery,
    sourcePath,
    experimentalBypassFor,
    experimentalStreamingLambdaPath,
    chain,
    exposeErrBody,
    partialFallback,
    hasPostponed,
    hasFallback,
    htmlSize,
    isDynamicRoute,
  }: PrerenderOptions) {
    this.type = 'Prerender';
    this.expiration = expiration;
    this.staleExpiration = staleExpiration;
    this.sourcePath = sourcePath;
    // These tri-state flags are assigned unconditionally (like
    // `staleExpiration`) so `true` | `false` | `undefined` round-trips intact.
    // Do not adopt the `partialFallback`/`exposeErrBody` idiom below, which
    // collapses `false` into `undefined`: for `hasFallback`, `false` (blocking
    // / omitted template) must stay distinct from `undefined` (concrete
    // prerender, no fallback concept).
    assertOptionalBoolean(hasPostponed, 'hasPostponed');
    this.hasPostponed = hasPostponed;

    assertOptionalBoolean(hasFallback, 'hasFallback');
    this.hasFallback = hasFallback;

    assertOptionalBoolean(isDynamicRoute, 'isDynamicRoute');
    this.isDynamicRoute = isDynamicRoute;

    if (
      htmlSize !== undefined &&
      (!Number.isInteger(htmlSize) || htmlSize < 0)
    ) {
      throw new Error(
        'The `htmlSize` argument for `Prerender` must be a non-negative integer or undefined.'
      );
    }
    this.htmlSize = htmlSize;

    this.lambda = lambda;
    if (this.lambda) {
      // "ISR" is the platform default lambda label for prerender functions
      this.lambda.operationType = this.lambda.operationType || 'ISR';
    }

    if (
      typeof group !== 'undefined' &&
      (group <= 0 || !Number.isInteger(group))
    ) {
      throw new Error(
        'The `group` argument for `Prerender` needs to be a natural number.'
      );
    }
    this.group = group;

    if (passQuery === true) {
      this.passQuery = true;
    } else if (
      typeof passQuery !== 'boolean' &&
      typeof passQuery !== 'undefined'
    ) {
      throw new Error(
        `The \`passQuery\` argument for \`Prerender\` must be a boolean.`
      );
    }

    if (bypassToken == null) {
      this.bypassToken = null;
    } else if (typeof bypassToken === 'string') {
      if (bypassToken.length < 32) {
        // Enforce 128 bits of entropy for safety reasons (UUIDv4 size)
        throw new Error(
          'The `bypassToken` argument for `Prerender` must be 32 characters or more.'
        );
      }
      this.bypassToken = bypassToken;
    } else {
      throw new Error(
        'The `bypassToken` argument for `Prerender` must be a `string`.'
      );
    }

    if (experimentalBypassFor !== undefined) {
      if (
        !Array.isArray(experimentalBypassFor) ||
        experimentalBypassFor.some(
          field =>
            typeof field !== 'object' ||
            typeof field.type !== 'string' ||
            (field.type === 'host' && 'key' in field) ||
            (field.type !== 'host' && typeof field.key !== 'string') ||
            (field.value !== undefined &&
              typeof field.value !== 'string' &&
              (typeof field.value !== 'object' ||
                field.value === null ||
                Array.isArray(field.value)))
        )
      ) {
        throw new Error(
          'The `experimentalBypassFor` argument for `Prerender` must be Array of objects with fields `type`, `key` and optionally `value`.'
        );
      }

      this.experimentalBypassFor = experimentalBypassFor;
    }

    if (typeof fallback === 'undefined') {
      throw new Error(
        'The `fallback` argument for `Prerender` needs to be a `FileBlob`, `FileFsRef`, `FileRef`, or null.'
      );
    }
    this.fallback = fallback;

    if (initialHeaders !== undefined) {
      if (
        !initialHeaders ||
        typeof initialHeaders !== 'object' ||
        Object.entries(initialHeaders).some(
          ([key, value]) => typeof key !== 'string' || typeof value !== 'string'
        )
      ) {
        throw new Error(
          `The \`initialHeaders\` argument for \`Prerender\` must be an object with string key/values`
        );
      }
      this.initialHeaders = initialHeaders;
    }

    if (initialStatus !== undefined) {
      if (initialStatus <= 0 || !Number.isInteger(initialStatus)) {
        throw new Error(
          `The \`initialStatus\` argument for \`Prerender\` must be a natural number.`
        );
      }
      this.initialStatus = initialStatus;
    }

    if (allowQuery !== undefined) {
      if (!Array.isArray(allowQuery)) {
        throw new Error(
          'The `allowQuery` argument for `Prerender` must be Array.'
        );
      }
      if (!allowQuery.every(q => typeof q === 'string')) {
        throw new Error(
          'The `allowQuery` argument for `Prerender` must be Array of strings.'
        );
      }
      this.allowQuery = allowQuery;
    }

    if (allowHeader !== undefined) {
      if (!Array.isArray(allowHeader)) {
        throw new Error(
          'The `allowHeader` argument for `Prerender` must be Array.'
        );
      }
      if (!allowHeader.every(q => typeof q === 'string')) {
        throw new Error(
          'The `allowHeader` argument for `Prerender` must be Array of strings.'
        );
      }
      this.allowHeader = allowHeader;
    }

    if (experimentalStreamingLambdaPath !== undefined) {
      if (typeof experimentalStreamingLambdaPath !== 'string') {
        throw new Error(
          'The `experimentalStreamingLambdaPath` argument for `Prerender` must be a string.'
        );
      }
      this.experimentalStreamingLambdaPath = experimentalStreamingLambdaPath;
    }

    if (chain !== undefined) {
      if (typeof chain !== 'object') {
        throw new Error(
          'The `chain` argument for `Prerender` must be an object.'
        );
      }

      if (
        !chain.headers ||
        typeof chain.headers !== 'object' ||
        Object.entries(chain.headers).some(
          ([key, value]) => typeof key !== 'string' || typeof value !== 'string'
        )
      ) {
        throw new Error(
          `The \`chain.headers\` argument for \`Prerender\` must be an object with string key/values`
        );
      }

      if (!chain.outputPath || typeof chain.outputPath !== 'string') {
        throw new Error(
          'The `chain.outputPath` argument for `Prerender` must be a string.'
        );
      }

      this.chain = chain;
    }

    if (exposeErrBody === true) {
      this.exposeErrBody = true;
    } else if (
      typeof exposeErrBody !== 'boolean' &&
      typeof exposeErrBody !== 'undefined'
    ) {
      throw new Error(
        `The \`exposeErrBody\` argument for \`Prerender\` must be a boolean.`
      );
    }

    if (partialFallback === true) {
      this.partialFallback = true;
    } else if (
      typeof partialFallback !== 'boolean' &&
      typeof partialFallback !== 'undefined'
    ) {
      throw new Error(
        `The \`partialFallback\` argument for \`Prerender\` must be a boolean.`
      );
    }
  }
}
