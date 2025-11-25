import { Builder } from '.';

/**
 * List of backend frameworks supported by the experimental backends feature
 */
export const BACKEND_FRAMEWORKS = [
  'express',
  'hono',
  'h3',
  'nestjs',
  'fastify',
  'elysia',
] as const;

export const BACKEND_BUILDERS = [
  '@vercel/express',
  '@vercel/hono',
  '@vercel/h3',
  '@vercel/nestjs',
  '@vercel/fastify',
  '@vercel/elysia',
] as const;

export type BackendFramework = (typeof BACKEND_FRAMEWORKS)[number];

/**
 * Checks if the given framework is a backend framework
 */
export function isBackendFramework(
  framework: string | null | undefined
): framework is BackendFramework {
  if (!framework) return false;
  return BACKEND_FRAMEWORKS.includes(framework as BackendFramework);
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

export function isBackendBuilder(builder: Builder | null | undefined): boolean {
  if (!builder) return false;
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
