import type Client from '../../util/client';
import output from '../../output-manager';
import type {
  Project,
  ProjectLinked,
  ProjectProtectionBypass,
} from '@vercel-internals/types';
import chalk from 'chalk';
import sleep from '../../util/sleep';

async function createDeploymentProtectionToken(
  client: Client,
  projectId: string,
  orgId: string
): Promise<string> {
  if (!client.authConfig.token) {
    output.debug(
      'No auth token available, skipping deployment protection token'
    );
    throw new Error(
      'Authentication required to create protection bypass token'
    );
  }

  try {
    const response = await client.fetch<{
      protectionBypass: ProjectProtectionBypass;
    }>(`/v1/projects/${projectId}/protection-bypass`, {
      method: 'PATCH',
      body: '{}',
      headers: {
        'Content-Type': 'application/json',
      },
      accountId: orgId,
    });
    const { protectionBypass } = response;

    output.log(
      `You require a deployment protection bypass token to access this deployment... Generating one now...`
    );
    output.log(
      `Successfully generated deployment protection bypass token for project ${chalk.bold(projectId)}\n`
    );

    output.debug(`Protection Bypass Response: ${protectionBypass}`);

    // yes, it really doesn't work unless you sleep
    await sleep(1000);

    return getAutomationBypassToken(protectionBypass);
  } catch (error) {
    output.debug(
      `Failed to generate deployment protection bypass token: ${error}`
    );

    output.note(
      'To bypass deployment protection, create a "Protection Bypass for Automation" secret in your project settings:'
    );
    output.log(`  1. Visit ${chalk.cyan('https://vercel.com/dashboard')}`);
    output.log(`  2. Go to your project settings → Deployment Protection`);
    output.log(`  3. Generate a "Protection Bypass for Automation" secret`);
    output.log(
      `  4. Use it with ${chalk.cyan(
        '--protection-bypass'
      )} flag or set ${chalk.cyan('VERCEL_AUTOMATION_BYPASS_SECRET')} env var`
    );
    output.log('');

    throw new Error('Failed to create deployment protection bypass token');
  }
}

export function getAutomationBypassToken(
  protectionBypass: Project['protectionBypass']
): string {
  if (!protectionBypass) {
    throw new Error('No protection bypass tokens found');
  }

  const token = Object.keys(protectionBypass).find(
    key => protectionBypass[key].scope === 'automation-bypass'
  );

  if (!token) {
    throw new Error(
      'No automation bypass token found in protection bypass settings'
    );
  }

  return token;
}

export async function getOrCreateDeploymentProtectionToken(
  client: Client,
  { project, org }: ProjectLinked
): Promise<string> {
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    output.debug('Using protection bypass secret from environment variable');
    return process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }

  if (
    project.protectionBypass &&
    Object.values(project.protectionBypass).length
  ) {
    const protectionBypass = getAutomationBypassToken(project.protectionBypass);
    if (protectionBypass) {
      output.debug(
        `Using existing protection bypass token from project settings: ${protectionBypass}`
      );
      return protectionBypass;
    }
  }
  const token = await createDeploymentProtectionToken(
    client,
    project.id,
    org.id
  );
  return token;
}
