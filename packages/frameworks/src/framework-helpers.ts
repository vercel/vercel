/**
 * List of backend frameworks supported by the experimental backends feature
 */
export const BACKEND_FRAMEWORKS = [
  'express',
  'hono',
  'h3',
  'koa',
  'nestjs',
  'fastify',
  'elysia',
] as const;

/**
 * List of Python frameworks (for runtime inference and experimental features).
 * Includes FastAPI, Flask, and the generic Python preset.
 */
export const PYTHON_FRAMEWORKS = [
  'fastapi',
  'flask',
  'python', // Generic Python framework preset
] as const;

export const RUNTIME_FRAMEWORKS = ['python'] as const;

/**
 * List of framework-specific backend builders that get replaced by UNIFIED_BACKEND_BUILDER
 * when experimental backends is enabled
 */
export const BACKEND_BUILDERS = [
  '@vercel/express',
  '@vercel/hono',
  '@vercel/h3',
  '@vercel/koa',
  '@vercel/nestjs',
  '@vercel/fastify',
  '@vercel/elysia',
] as const;

/**
 * The unified backend builder that replaces framework-specific backend builders
 */
export const UNIFIED_BACKEND_BUILDER = '@vercel/backends' as const;

export type BackendFramework = (typeof BACKEND_FRAMEWORKS)[number];
export type PythonFramework = (typeof PYTHON_FRAMEWORKS)[number];

/**
 * Checks if the given framework is a backend framework (Node.js)
 */
export function isBackendFramework(
  framework: string | null | undefined
): framework is BackendFramework {
  if (!framework) return false;
  if (isPythonFramework(framework)) return true;
  return BACKEND_FRAMEWORKS.includes(framework as BackendFramework);
}

/**
 * Checks if the given framework is a Python framework (FastAPI, Flask, or generic Python)
 */
export function isPythonFramework(
  framework: string | null | undefined
): framework is (typeof PYTHON_FRAMEWORKS)[number] {
  if (!framework) return false;
  return PYTHON_FRAMEWORKS.includes(framework as PythonFramework);
}

/**
 * Checks if the given framework is either a backend framework or a Python framework
 */
export function isRuntimeFramework(
  framework: string | null | undefined
): boolean {
  return isBackendFramework(framework) || isPythonFramework(framework);
}

// Opt builds into experimental builder, but don't introspect the app
export function isExperimentalBackendsWithoutIntrospectionEnabled(): boolean {
  return process.env.VERCEL_BACKENDS_BUILDS === '1';
}

export function isExperimentalBackendsEnabled(): boolean {
  return (
    isExperimentalBackendsWithoutIntrospectionEnabled() ||
    process.env.VERCEL_EXPERIMENTAL_BACKENDS === '1' ||
    // Previously used for experimental express and hono builds
    process.env.VERCEL_EXPERIMENTAL_EXPRESS_BUILD === '1' ||
    process.env.VERCEL_EXPERIMENTAL_HONO_BUILD === '1'
  );
}

/** Builder-like object with at least a `use` property (e.g. from @vercel/build-utils Builder) */
export interface BuilderLike {
  use?: string;
}

export function isBackendBuilder(
  builder: BuilderLike | null | undefined
): boolean {
  if (!builder) return false;
  if (builder.use === UNIFIED_BACKEND_BUILDER) return true;
  const use = builder.use as (typeof BACKEND_BUILDERS)[number];
  return BACKEND_BUILDERS.includes(use);
}

/**
 * Checks if experimental backends are enabled AND the framework is a backend framework
 */
export function shouldUseExperimentalBackends(
  framework: string | null | undefined
): boolean {
  return isExperimentalBackendsEnabled() && isBackendFramework(framework);
}
