import type Client from '../client';
import type { Project, ProjectSettings } from '@vercel-internals/types';

/**
 * Deployment type used to enable standard Vercel Auth (SSO) protection. `all`
 * protects every deployment URL, including the generated production deployment
 * URLs — matching the long-standing default behaviour the CLI relied on before
 * the server-side default changed.
 */
const ENABLED_DEPLOYMENT_TYPE = 'all';

export default async function createProject(
  client: Client,
  settings: ProjectSettings & {
    name: string;
    vercelAuth?: 'none' | 'standard';
    v0?: boolean;
  }
) {
  const { vercelAuth, v0, ...rest } = settings;
  const project = await client.fetch<Project>('/v1/projects', {
    method: 'POST',
    body: {
      ...rest,
      /**
       * Always send an explicit value so we don't depend on the server-side
       * default, which is not guaranteed to be "standard protection".
       *
       * `null` disables Vercel Auth (all deployments public). Otherwise we
       * enable standard protection across all deployment URLs (including
       * production), matching the "Standard Protection (recommended)" option.
       *
       * vercelAuth used to be called ssoProtection.
       */
      ...(vercelAuth === 'none'
        ? { ssoProtection: null }
        : { ssoProtection: { deploymentType: ENABLED_DEPLOYMENT_TYPE } }),
      ...(v0 ? { v0: true } : undefined),
    },
  });
  return project;
}
