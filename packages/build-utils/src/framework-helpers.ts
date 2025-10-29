/**
 * List of backend frameworks supported by the experimental backends feature
 */
export const BACKEND_FRAMEWORKS = [
  'express',
  'hono',
  'h3',
  'nestjs',
  'fastify',
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

/**
 * Checks if experimental backends are enabled via environment variable
 */
export function isExperimentalBackendsEnabled(): boolean {
  return (
    process.env.VERCEL_EXPERIMENTAL_BACKENDS === '1' ||
    // Previously used for experimental express and hono builds
    process.env.VERCEL_EXPERIMENTAL_EXPRESS_BUILD === '1' ||
    process.env.VERCEL_EXPERIMENTAL_HONO_BUILD === '1'
  );
}

/**
 * Checks if experimental backends are enabled AND the framework is a backend framework
 */
export function shouldUseExperimentalBackends(
  framework: string | null | undefined
): boolean {
  return isExperimentalBackendsEnabled() && isBackendFramework(framework);
}
