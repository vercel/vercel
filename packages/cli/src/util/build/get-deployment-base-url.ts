/**
 * Pick the host that absolute service URLs should be rooted at during a
 * Vercel build.
 *
 * For production builds (`VERCEL_ENV=production`) we prefer the project's
 * stable production URL (`VERCEL_PROJECT_PRODUCTION_URL`) over the per-
 * deployment URL so values baked into client bundles — links, cookies tied
 * to the canonical front-end domain, server-to-server URLs — survive across
 * deployments. Previews and any production build without a production URL
 * provisioned yet fall back to `VERCEL_URL`.
 */
export function getDeploymentBaseUrl(
  env: NodeJS.ProcessEnv
): string | undefined {
  if (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return env.VERCEL_PROJECT_PRODUCTION_URL;
  }
  return env.VERCEL_URL;
}
