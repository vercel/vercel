/**
 * Shared static-file CDN promotion for builders that deploy a web framework as
 * one Lambda behind a catch-all route. Framework-specific discovery stays in
 * each builder and emits a {@link StaticDiscovery}; this module copies the
 * discovered directories into the build output's static dir and produces the
 * routes that keep the framework's precedence.
 */
export {
  EMPTY_DISCOVERY,
  type ShadowRoute,
  type StaticBundleExclusions,
  type StaticDiscovery,
  type StaticFallback,
  type StaticMount,
  type StaticPromotionResult,
  type StaticPromotionOptions,
} from './types';
export { copyStaticMounts, promoteStaticFiles } from './promote';
export {
  MAX_ROUTE_SRC_LENGTH,
  NAVIGATION_ACCEPT_RE,
  staticDirectoryRedirects,
  staticFallbackRoutes,
  staticShadowRoutes,
} from './routes';
export { STATIC_PLACEHOLDER_FILE, staticBundleExclusions } from './bundle';
