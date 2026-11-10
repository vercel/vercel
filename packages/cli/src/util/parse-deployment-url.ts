import { URL } from 'url';

/**
 * Parses a Vercel dashboard deployment URL or normalizes a deployment ID.
 *
 * Handles:
 * - Dashboard URLs: `https://vercel.com/{scope}/{project}/{deploymentId}`
 * - Deployment URLs: `https://my-app-abc123.vercel.app`
 * - Deployment IDs with prefix: `dpl_3qQucGyR7QyigKYWa7idzzXeWKwG`
 * - Deployment IDs without prefix: `3qQucGyR7QyigKYWa7idzzXeWKwG`
 */
export interface ParsedDeploymentUrl {
  deploymentIdOrHost: string;
  scope?: string;
}

export function parseDeploymentUrl(input: string): ParsedDeploymentUrl {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return normalizeDeploymentId(input);
  }

  if (url.hostname === 'vercel.com' || url.hostname === 'www.vercel.com') {
    return parseVercelDashboardUrl(url);
  }

  return { deploymentIdOrHost: url.hostname };
}

function parseVercelDashboardUrl(url: URL): ParsedDeploymentUrl {
  const pathParts = url.pathname.split('/').filter(Boolean);

  if (pathParts.length >= 3) {
    const [scope, , deploymentId] = pathParts;
    return {
      deploymentIdOrHost:
        normalizeDeploymentId(deploymentId).deploymentIdOrHost,
      scope,
    };
  }

  return { deploymentIdOrHost: url.hostname };
}

export function normalizeDeploymentId(input: string): ParsedDeploymentUrl {
  if (input.includes('.')) {
    return { deploymentIdOrHost: input };
  }

  if (input.startsWith('dpl_')) {
    return { deploymentIdOrHost: input };
  }

  return { deploymentIdOrHost: `dpl_${input}` };
}
