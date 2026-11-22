import type { Deployment } from '@vercel-internals/types';

/**
 * The production address a deployment was assigned, e.g. its custom domain.
 * Null unless production alias assignment finished without an error, so
 * `--no-wait`, `--skip-domain`, and failed assignments never claim one.
 */
export function getProductionUrl(deployment: {
  target?: string | null;
  alias?: string[];
  aliasAssigned?: Deployment['aliasAssigned'];
  aliasError?: unknown;
}): string | null {
  if (
    deployment.target !== 'production' ||
    !deployment.aliasAssigned ||
    deployment.aliasError
  ) {
    return null;
  }
  const domain = deployment.alias?.[0];
  return domain ? `https://${domain}` : null;
}
