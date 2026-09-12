import { isPythonFramework, isBackendFramework } from '@vercel/build-utils';
import type { ServiceRuntime } from '@vercel/build-utils';
import type { Framework } from '@vercel/frameworks';
import { frameworkList } from '@vercel/frameworks';
import { RUNTIME_BUILDERS } from './constants';

/**
 * Framework list filtered to entries eligible for auto-detection.
 * Includes non-experimental frameworks and runtime frameworks (Python, Node, etc.)
 * even when marked experimental.
 */
export const DETECTION_FRAMEWORKS = frameworkList.filter(
  (framework: Framework) =>
    !framework.experimental || framework.runtimeFramework
);

/**
 * Infer runtime from a framework slug.
 *
 * Examples:
 * - `python`  → `python`
 * - `fastapi` → `python`
 * - `express` → `node`
 */
export function inferRuntimeFromFramework(
  framework: string | null | undefined
): ServiceRuntime | undefined {
  if (!framework) return undefined;

  // Runtime framework slugs (e.g. "python", "node") map directly to runtime names.
  if (framework in RUNTIME_BUILDERS) return framework as ServiceRuntime;

  if (isPythonFramework(framework)) return 'python';
  if (isBackendFramework(framework)) return 'node';

  return undefined;
}

/**
 * Returns true if the framework is a client-only frontend (no server runtime).
 */
export function isFrontendFramework(
  framework: string | null | undefined
): boolean {
  return !!framework && !inferRuntimeFromFramework(framework);
}

/**
 * BFF (Backend-for-Frontend) frameworks that expose their own server-side API
 * routes (e.g. Next.js `/api/*`, Nuxt `/api/*`). Backend services co-deployed
 * alongside a BFF need a namespaced mount prefix to avoid shadowing those routes.
 */
const BFF_FRAMEWORKS = new Set([
  'nextjs',
  'nuxtjs',
  'sveltekit',
  'remix',
  'solidstart',
]);

export function isBFFFramework(framework: string | null | undefined): boolean {
  return !!framework && BFF_FRAMEWORKS.has(framework);
}

export function filterFrameworksByRuntime<T extends { slug?: string | null }>(
  frameworks: readonly T[],
  runtime?: ServiceRuntime
): T[] {
  if (!runtime) return [...frameworks];
  return frameworks.filter(f => inferRuntimeFromFramework(f.slug) === runtime);
}
