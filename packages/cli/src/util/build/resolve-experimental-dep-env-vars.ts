import { URLSearchParams } from 'url';
import type Client from '../client';

type ExperimentalDepsLike = Record<
  string,
  {
    projectId?: string;
    env?: string;
  }
>;

type DeploymentSummary = {
  uid: string;
  url: string;
};

type DeploymentResponse = {
  deployments: DeploymentSummary[];
};

type CachedResolution = {
  baseUrl?: string;
  warning?: string;
};

const BRANCH_META_KEYS = [
  'githubCommitRef',
  'gitlabCommitRef',
  'bitbucketCommitRef',
] as const;

export interface ResolveExperimentalDepEnvVarsOptions {
  client: Client;
  deps?: ExperimentalDepsLike;
  target: string;
  branch?: string;
  accountId?: string;
  cache?: Map<string, Promise<CachedResolution>>;
}

export interface ResolveExperimentalDepEnvVarsResult {
  envVars: Record<string, string>;
  warnings: string[];
}

function depKeyToEnvVarName(depKey: string, customEnv?: string): string {
  if (typeof customEnv === 'string' && customEnv.length > 0) {
    return customEnv;
  }
  return `${depKey.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_URL`;
}

function depKeyToRouteSuffix(depKey: string): string {
  const firstDot = depKey.indexOf('.');
  if (firstDot === -1) {
    return '';
  }

  const suffix = depKey
    .slice(firstDot + 1)
    .split('.')
    .filter(Boolean)
    .join('/');

  return suffix ? `/${suffix}` : '';
}

async function fetchLatestDeployment(
  client: Client,
  options: {
    projectId: string;
    target?: string;
    branch?: string;
    branchMetaKey?: (typeof BRANCH_META_KEYS)[number];
    accountId?: string;
  }
): Promise<DeploymentSummary | null> {
  const query = new URLSearchParams();
  query.set('projectId', options.projectId);
  query.set('limit', '1');
  query.set('state', 'READY');

  if (typeof options.target === 'string' && options.target.length > 0) {
    query.set('target', options.target);
  }
  if (options.branch && options.branchMetaKey) {
    query.set(`meta-${options.branchMetaKey}`, options.branch);
  }

  const { deployments } = await client.fetch<DeploymentResponse>(
    `/v6/deployments?${query}`,
    options.accountId ? { accountId: options.accountId } : undefined
  );

  return deployments[0] ?? null;
}

async function resolveClosestDeploymentBaseUrl(
  client: Client,
  options: {
    projectId: string;
    target: string;
    branch?: string;
    accountId?: string;
  }
): Promise<CachedResolution> {
  try {
    if (options.branch) {
      for (const branchMetaKey of BRANCH_META_KEYS) {
        const deployment = await fetchLatestDeployment(client, {
          projectId: options.projectId,
          target: options.target,
          branch: options.branch,
          branchMetaKey,
          accountId: options.accountId,
        });
        if (deployment) {
          return { baseUrl: `https://${deployment.url}` };
        }
      }
    }

    const targetDeployment = await fetchLatestDeployment(client, {
      projectId: options.projectId,
      target: options.target,
      accountId: options.accountId,
    });
    if (targetDeployment) {
      return { baseUrl: `https://${targetDeployment.url}` };
    }

    if (options.branch) {
      for (const branchMetaKey of BRANCH_META_KEYS) {
        const deployment = await fetchLatestDeployment(client, {
          projectId: options.projectId,
          branch: options.branch,
          branchMetaKey,
          accountId: options.accountId,
        });
        if (deployment) {
          return { baseUrl: `https://${deployment.url}` };
        }
      }
    }

    const fallbackDeployment = await fetchLatestDeployment(client, {
      projectId: options.projectId,
      accountId: options.accountId,
    });
    if (fallbackDeployment) {
      return { baseUrl: `https://${fallbackDeployment.url}` };
    }

    return {
      warning: `Could not resolve a ready deployment for dependency project "${options.projectId}".`,
    };
  } catch (error) {
    return {
      warning: `Could not resolve a deployment for dependency project "${options.projectId}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

export async function resolveExperimentalDepEnvVars(
  options: ResolveExperimentalDepEnvVarsOptions
): Promise<ResolveExperimentalDepEnvVarsResult> {
  const { client, deps, target, branch, accountId } = options;

  if (!deps || Object.keys(deps).length === 0) {
    return { envVars: {}, warnings: [] };
  }

  const cache = options.cache ?? new Map<string, Promise<CachedResolution>>();
  const envVars: Record<string, string> = {};
  const warnings: string[] = [];

  for (const [depKey, depConfig] of Object.entries(deps)) {
    const projectId =
      typeof depConfig?.projectId === 'string' && depConfig.projectId.length > 0
        ? depConfig.projectId
        : undefined;
    if (!projectId) {
      continue;
    }

    const cacheKey = `${accountId ?? ''}:${projectId}:${target}:${branch ?? ''}`;
    let resolutionPromise = cache.get(cacheKey);
    if (!resolutionPromise) {
      resolutionPromise = resolveClosestDeploymentBaseUrl(client, {
        projectId,
        target,
        branch,
        accountId,
      });
      cache.set(cacheKey, resolutionPromise);
    }

    const resolution = await resolutionPromise;
    if (!resolution.baseUrl) {
      if (resolution.warning) {
        warnings.push(
          `Could not resolve URL for dependency "${depKey}": ${resolution.warning}`
        );
      }
      continue;
    }

    const routeSuffix = depKeyToRouteSuffix(depKey);
    const envVarName = depKeyToEnvVarName(depKey, depConfig.env);
    envVars[envVarName] = `${resolution.baseUrl}${routeSuffix}`;
  }

  return { envVars, warnings };
}
