import type { Files } from '../types';

/**
 * Types for static-file promotion: the discovery contract a builder's
 * framework-specific discovery step hands in, plus the options and results of
 * the shared promotion steps.
 */

/** A mount's miss fallback: which file to serve, and with what status. */
export interface StaticFallback {
  /** File to serve for unmatched paths under the mount (e.g. "index.html"). */
  file: string;
  /** Status to serve it with (200 for index.html, 404 for 404.html). */
  status: number;
}

/** One directory served by the app at a URL prefix. */
export interface StaticMount {
  /** URL prefix, no trailing slash ("/" for root). */
  urlPath: string;
  /** Absolute source directory. */
  directory: string;
  /** Miss fallback for this mount, or null for none. */
  fallback: StaticFallback | null;
  /** Low-priority SPA-style mount, copied after all plain mounts. */
  frontend: boolean;
  /** Directory-index + bare-directory redirect mode. */
  html: boolean;
}

/** A path the app owns ahead of the CDN. */
export interface ShadowRoute {
  /** Regex body matched against the path minus its leading slash. */
  body: string;
  /** Sorted HTTP methods, or null for all methods. */
  methods: string[] | null;
}

/** Discovery output: the contract between a builder and this module. */
export interface StaticDiscovery {
  /** Mounts in declaration order. */
  mounts: StaticMount[];
  /** Paths the app owns, sorted by body. */
  shadowRoutes: ShadowRoute[];
  /** CDN URL paths (leading slash) the app owns; sorted and deduplicated. */
  excludedFiles: string[];
}

/**
 * The discovery result for "nothing to promote". Frozen (arrays included) so
 * the shared instance can't be mutated by a caller.
 */
export const EMPTY_DISCOVERY: StaticDiscovery = Object.freeze({
  mounts: Object.freeze([]),
  shadowRoutes: Object.freeze([]),
  excludedFiles: Object.freeze([]),
}) as unknown as StaticDiscovery;

/** Options shared by every promotion step. */
export interface StaticPromotionOptions {
  /** Prefix for debug log lines (e.g. "FastAPI"). */
  debugLabel?: string;
  /**
   * Serve fallback for navigation requests to extensioned paths
   * like `/app/main.js`. Defaults to false.
   */
  useFallbackForExtensionedPaths?: boolean;
}

/** Outcome of promoting a discovery's mounts, for wiring routes and output. */
export interface StaticPromotionResult {
  /**
   * The full discovery. `discovery.mounts` (every discovered mount, copied or
   * not) drives redirects, bundle exclusion and the fallback nested-mount
   * guard, since a mount owns its namespace at runtime even if its copy failed.
   */
  discovery: StaticDiscovery;
  /**
   * Mounts actually copied, in copy-priority order. Only these get fallback
   * routes: a `check: true` destination that doesn't exist ends the request
   * instead of reaching the Lambda.
   */
  copiedMounts: StaticMount[];
  /** Static output dir the mounts were copied into. */
  outputStaticDir: string;
}

/** Lambda bundle adjustments for promoted mounts. */
export interface StaticBundleExclusions {
  /** Glob patterns that exclude promoted mount directories from the Lambda. */
  excludePatterns: string[];
  /** Stub files that keep excluded mount directories present in the Lambda. */
  directoryStubs: Files;
}
