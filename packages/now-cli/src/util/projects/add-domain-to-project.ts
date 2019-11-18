import chalk from 'chalk';
import Client from '../client';
import wait from '../output/wait';

interface AliasTarget {
  createdAt?: number;
  domain: string;
  redirect?: string | null;
  target: 'PRODUCTION' | 'STAGING';
  configuredBy?: null | 'CNAME' | 'A';
  configuredChangedAt?: null | number;
  configuredChangeAttempts?: [number, number]; // [count, lastAttemptTimestamp]
}

export async function addDomainToProject(
  client: Client,
  projectNameOrId: string,
  domain: string
) {
  const cancelWait = wait(
    `Adding domain ${domain} to project ${chalk.bold(projectNameOrId)}`
  );
  try {
    const response = await client.fetch<AliasTarget[]>(
      `/projects/${encodeURIComponent(projectNameOrId)}/alias`,
      {
        method: 'POST',
        body: JSON.stringify({
          target: 'PRODUCTION',
          domain,
        }),
      }
    );

    const aliasTarget: AliasTarget | undefined = response.find(
      aliasTarget => aliasTarget.domain === domain
    );

    if (!aliasTarget) {
      throw new Error(
        `Unexpected error when adding the domain "${domain}" to project "${projectNameOrId}".`
      );
    }

    cancelWait();

    return aliasTarget;
  } catch (err) {
    cancelWait();

    if (500 > err.status) {
      return err;
    }

    throw err;
  }
}
