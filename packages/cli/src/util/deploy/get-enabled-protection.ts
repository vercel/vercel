import type { Project } from '@vercel-internals/types';
import type Client from '../client';
import output from '../../output-manager';
import { getProductionUrl } from './get-production-url';

const PROTECTION_METHODS = [
  {
    setting: 'ssoProtection',
    id: 'vercel_authentication',
    name: 'Vercel Authentication',
  },
  {
    setting: 'passwordProtection',
    id: 'password',
    name: 'Password Protection',
  },
] as const;

export type ProtectionMethod = (typeof PROTECTION_METHODS)[number];

export type EnabledProtection = ProtectionMethod & {
  /** Which URLs the method covers, such as `all` or `all_except_custom_domains`. */
  deploymentType?: string;
};

/**
 * The Deployment Protection methods turned on for a project, or null when the
 * settings could not be read. Never throws, so it can't fail a deploy.
 */
export async function getEnabledProtection(
  client: Client,
  project: Pick<Project, 'id' | 'accountId'>
): Promise<EnabledProtection[] | null> {
  try {
    const settings = await client.fetch<Record<string, unknown>>(
      `/v9/projects/${encodeURIComponent(project.id)}`,
      { accountId: project.accountId }
    );
    return PROTECTION_METHODS.filter(method => settings[method.setting]).map(
      method => ({
        ...method,
        deploymentType: readDeploymentType(settings[method.setting]),
      })
    );
  } catch (err) {
    output.debug(`Could not read Deployment Protection settings: ${err}`);
    return null;
  }
}

function readDeploymentType(setting: unknown): string | undefined {
  if (setting && typeof setting === 'object' && 'deploymentType' in setting) {
    const { deploymentType } = setting as { deploymentType: unknown };
    return typeof deploymentType === 'string' ? deploymentType : undefined;
  }
  return undefined;
}

/**
 * Scopes that leave a project's production domains public: Standard
 * Protection (`all_except_custom_domains`), legacy Standard Protection
 * (`prod_deployment_urls_and_all_previews`), and legacy Only Preview
 * Deployments (`preview`). Only All Deployments (`all`) protects them.
 */
const PRODUCTION_DOMAINS_PUBLIC = new Set([
  'all_except_custom_domains',
  'prod_deployment_urls_and_all_previews',
  'preview',
]);

/**
 * Legacy Only Preview Deployments (`preview`) leaves every production
 * deployment public, including its generated deployment URL.
 */
const PRODUCTION_DEPLOYMENTS_PUBLIC = new Set(['preview']);

/**
 * The methods that protect the URL people open after this deploy: the
 * production domain when one was assigned, otherwise the deployment URL
 * (previews, and production with `--skip-domain`, `--no-wait`, or a failed
 * alias). Standard Protection leaves production domains public but still
 * protects a production deployment's generated URL. An unknown scope counts
 * as protecting, so the notice errs toward pointing to `vercel curl`.
 */
export function getProtectionForDeployment(
  methods: EnabledProtection[] | null | undefined,
  deployment: Parameters<typeof getProductionUrl>[0]
): EnabledProtection[] {
  if (!methods) return [];
  if (deployment.target !== 'production') return methods;
  const publicScopes = getProductionUrl(deployment)
    ? PRODUCTION_DOMAINS_PUBLIC
    : PRODUCTION_DEPLOYMENTS_PUBLIC;
  return methods.filter(
    method => !method.deploymentType || !publicScopes.has(method.deploymentType)
  );
}
