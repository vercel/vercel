import type { StaticMount, StaticPromotionOptions } from './types';

/** `urlPath` with trailing slashes removed, so the root mount ("/") is ''. */
export function trimTrailingSlashes(urlPath: string): string {
  return urlPath.replace(/\/+$/, '');
}

export function trimSlashes(urlPath: string): string {
  return urlPath.replace(/^\/+|\/+$/g, '');
}

/**
 * True when `urlPath` is `base` or under it. `base` is a normalized (no
 * trailing slash) mount prefix, so '' is the root mount and covers everything.
 */
export function mountCovers(base: string, urlPath: string): boolean {
  return base === '' || urlPath === base || urlPath.startsWith(base + '/');
}

/**
 * Mounts in CDN copy-priority order: plain mounts (declaration order), then
 * frontends (longest prefix first). An earlier mount owns every colliding
 * path under its prefix.
 */
export function byCopyPriority(mounts: StaticMount[]): StaticMount[] {
  return [
    ...mounts.filter(m => !m.frontend),
    ...mounts
      .filter(m => m.frontend)
      .sort((a, b) => b.urlPath.length - a.urlPath.length),
  ];
}

/**
 * Escape regex metacharacters in a literal path segment before it goes into a
 * route `src`. Discovery emits shadow bodies already escaped, but mount
 * prefixes are raw URL paths and must be escaped here.
 */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Debug-log prefix for a step. */
export function logLabel(opts: StaticPromotionOptions | undefined): string {
  return opts?.debugLabel ?? 'static-files';
}
