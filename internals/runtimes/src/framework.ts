import { isPythonFramework, isBackendFramework } from '@vercel/build-utils';
import type { ServiceRuntime } from '@vercel/build-utils';
import type { Framework } from '@vercel/frameworks';
import { frameworkList } from '@vercel/frameworks';
import { RUNTIME_BUILDERS, BUILDER_RUNTIMES } from './constants';

export const frameworksBySlug = new Map<string, Framework>(
  frameworkList.flatMap(f => (typeof f.slug === 'string' ? [[f.slug, f]] : []))
);

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

const STATIC_BUILDER_RUNTIMES: Partial<Record<string, ServiceRuntime>> = {
  hugo: 'go',
  jekyll: 'ruby',
  middleman: 'ruby',
  zola: 'rust',
};

/**
 * Infer the server runtime owned by a framework. Client-only frameworks such as
 * Vite return undefined, even though their build tooling runs on Node.js.
 */
export function inferServerRuntimeFromFramework(
  framework: string | null | undefined
): ServiceRuntime | undefined {
  if (!framework || framework === 'services') return undefined;

  const builder = frameworksBySlug.get(framework)?.useRuntime?.use;
  if (!builder) return undefined;

  // Framework-specific server builders are Node.js unless they map to a
  // runtime builder explicitly. Static frameworks do not declare useRuntime.
  return BUILDER_RUNTIMES[builder] ?? 'node';
}

/**
 * Infer the runtime used by a framework's builder.
 *
 * A builder may not necessarily produce a function with a runtime, e.g. @vercel/static-build.
 */
export function inferBuilderRuntimeFromFramework(
  framework: string | null | undefined
): ServiceRuntime | undefined {
  if (!framework || framework === 'container' || framework === 'services')
    return undefined;

  const f = frameworksBySlug.get(framework);
  if (!f) return undefined;

  // Frameworks with a declared builder resolve via BUILDER_RUNTIMES.
  const declaredBuilder = f.useRuntime?.use;
  if (declaredBuilder) return BUILDER_RUNTIMES[declaredBuilder];

  // No declared builder: built by @vercel/static-build, which reports node
  // unless the framework is in STATIC_BUILDER_RUNTIMES.
  return STATIC_BUILDER_RUNTIMES[framework] ?? 'node';
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

/**
 * The framework preset named after a runtime (e.g. "python", "go"), or
 * undefined if the runtime has none.
 */
export function getRuntimeFramework(
  runtime: string | null | undefined
): string | undefined {
  if (!runtime) return undefined;
  return frameworksBySlug.get(runtime)?.runtimeFramework ? runtime : undefined;
}
