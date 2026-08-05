import { Builder } from '.';

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

export const PYTHON_FRAMEWORKS = [
  'fastapi',
  'flask',
  'django',
  'python', // Generic Python framework preset
  'fasthtml',
] as const;

export const PHP_FRAMEWORKS = ['laravel'] as const;

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
export type PhpFramework = (typeof PHP_FRAMEWORKS)[number];

/**
 * Checks if the given framework is a backend framework
 * TODO: make this function generic to all runtimes' backend frameworks and
 * update callers to use isNodeBackendFramework for Node-specific frameworks.
 */
export function isBackendFramework(
  framework: string | null | undefined
): framework is BackendFramework {
  if (!framework) return false;
  return BACKEND_FRAMEWORKS.includes(framework as BackendFramework);
}

export function isNodeBackendFramework(
  framework: string | null | undefined
): framework is BackendFramework {
  if (!framework) return false;
  return BACKEND_FRAMEWORKS.includes(framework as BackendFramework);
}

export function isPythonFramework(
  framework: string | null | undefined
): framework is (typeof PYTHON_FRAMEWORKS)[number] {
  if (!framework) return false;
  return PYTHON_FRAMEWORKS.includes(framework as PythonFramework);
}

export function isPhpFramework(
  framework: string | null | undefined
): framework is PhpFramework {
  if (!framework) return false;
  return PHP_FRAMEWORKS.includes(framework as PhpFramework);
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

/**
 * Gates the migration of a language runtime from its legacy Lambda builder to
 * Cloud Native Buildpack container builds via `@vercel/container`.
 *
 * Each buildpack-backed runtime has its own experiment flag,
 * `VERCEL_EXPERIMENTAL_BUILDPACK_<RUNTIME>` (e.g.
 * `VERCEL_EXPERIMENTAL_BUILDPACK_RUBY=1`), so languages graduate
 * independently.
 */
export function isBuildpackRuntimeEnabled(runtime: string): boolean {
  return (
    process.env[`VERCEL_EXPERIMENTAL_BUILDPACK_${runtime.toUpperCase()}`] ===
    '1'
  );
}

export function isBackendBuilder(builder: Builder | null | undefined): boolean {
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
