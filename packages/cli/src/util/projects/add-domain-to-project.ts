import chalk from 'chalk';
import Client from '../client';
import wait from '../output/wait';
import { ProjectAliasTarget } from '../../types';

export async function addDomainToProject(
  client: Client,
  projectNameOrId: string,
  domain: string
) {
  const cancelWait = wait(
    `Adding domain ${domain} to project ${chalk.bold(projectNameOrId)}`
  );
  try {
    const response = await client.fetch<ProjectAliasTarget[]>(
      `/projects/${encodeURIComponent(projectNameOrId)}/alias`,
      {
        method: 'POST',
        body: JSON.stringify({
          target: 'PRODUCTION',
          domain,
        }),
      }
    );

    const aliasTarget: ProjectAliasTarget | undefined = response.find(
      aliasTarget => aliasTarget.domain === domain
    );

    if (!aliasTarget) {
      throw new Error(
        `Unexpected error when adding the domain "${domain}" to project "${projectNameOrId}".`
      );
    }

    return aliasTarget;
  } catch (err) {
    if (err.status < 500) {
      return err;
    }

    throw err;
  } finally {
    cancelWait();
  }
}
