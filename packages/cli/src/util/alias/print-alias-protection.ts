import chalk from 'chalk';
import type { Deployment } from '@vercel-internals/types';
import type Client from '../client';
import output from '../../output-manager';
import getDeployment from '../get-deployment';
import { isAPIError } from '../errors-ts';
import { getProjectDomain } from '../projects/get-project-domain';
import {
  getEnabledProtection,
  getProtectionForAlias,
} from '../deploy/get-enabled-protection';
import isWildcardAlias from './is-wildcard-alias';

type AliasDeployment = Pick<Deployment, 'projectId' | 'ownerId' | 'target'>;

/**
 * After `vercel alias set`, warn when Deployment Protection still guards the
 * alias, so a successful assignment isn't mistaken for a public URL. Mirrors
 * the notice `vercel deploy` prints. Never throws, so it can't fail the alias.
 */
export async function printAliasProtection(
  client: Client,
  deploymentOrIdOrUrl: AliasDeployment | string,
  contextName: string,
  alias: string
): Promise<void> {
  try {
    const deployment =
      typeof deploymentOrIdOrUrl === 'string'
        ? await getDeployment(client, contextName, deploymentOrIdOrUrl)
        : deploymentOrIdOrUrl;
    const { projectId, ownerId } = deployment;
    if (!projectId || !ownerId) return;

    const methods = await getEnabledProtection(client, {
      id: projectId,
      accountId: ownerId,
    });
    if (!methods?.length) return;

    // Under Standard Protection, only a domain added to the project is
    // public on production; a deployment alias is not.
    let isProjectDomain = false;
    if (deployment.target === 'production' && !isWildcardAlias(alias)) {
      const domain = await getProjectDomain(client, projectId, alias);
      isProjectDomain = !isAPIError(domain) && domain.projectId === projectId;
    }

    const protection = getProtectionForAlias(
      methods,
      deployment,
      isProjectDomain
    );
    if (!protection.length) return;

    const url = isWildcardAlias(alias) ? alias : `https://${alias}`;
    const names = protection.map(method => method.name).join(', ');
    output.warning(
      `Deployment Protection is on for this project (${names}), so ${url} requires access. Use ${chalk.cyan('`vercel curl`')} to access it.`
    );
  } catch (err) {
    output.debug(`Could not check Deployment Protection for the alias: ${err}`);
  }
}
