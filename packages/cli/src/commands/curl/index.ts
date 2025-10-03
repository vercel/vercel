import { spawn } from 'child_process';
import type Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import output from '../../output-manager';
import { help } from '../help';
import { curlCommand } from './command';
import type {
  Deployment,
  Project,
  ProjectProtectionBypass,
} from '@vercel-internals/types';
import parseTarget from '../../util/parse-target';

async function getDeploymentUrl(
  client: Client,
  projectId: string,
  target?: string
): Promise<string | null> {
  const query = new URLSearchParams({ projectId, limit: '1' });
  if (target) {
    query.set('target', target);
  }

  try {
    const response = await client.fetch<{ deployments: Deployment[] }>(
      `/v6/deployments?${query}`
    );

    const deployment = response.deployments[0];
    if (!deployment || !deployment.url) {
      return null;
    }

    return `https://${deployment.url}`;
  } catch (error) {
    output.debug(`Failed to fetch deployment: ${error}`);
    return null;
  }
}

async function getDeploymentUrlBySha(
  client: Client,
  projectId: string,
  sha: string
): Promise<string | null> {
  const query = new URLSearchParams({ projectId });

  try {
    const response = await client.fetch<{ deployments: Deployment[] }>(
      `/v6/deployments?${query}`
    );

    // Find deployment with matching SHA
    const deployment = response.deployments.find(
      dep =>
        dep.meta?.githubCommitSha === sha || dep.meta?.gitlabCommitSha === sha
    );

    if (!deployment || !deployment.url) {
      return null;
    }

    return `https://${deployment.url}`;
  } catch (error) {
    output.debug(`Failed to fetch deployment by SHA: ${error}`);
    return null;
  }
}

function generateRandomSecret(length = 32) {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }
  return result;
}

async function generateDeploymentProtectionToken(
  client: Client,
  projectId: string
): Promise<string | null> {
  if (!client.authConfig.token) {
    output.debug(
      'No auth token available, skipping deployment protection token'
    );
    return null;
  }

  const query = new URLSearchParams();
  if (client.config.currentTeam) {
    query.set('teamId', client.config.currentTeam);
  }
  // secret must be 32 characters long with no special characters
  const secret = generateRandomSecret();
  try {
    output.debug(
      `Generating deployment protection bypass token for project ${projectId}`
    );
    const response = await client.fetch<{
      protectionBypass: ProjectProtectionBypass;
    }>(
      `/v1/projects/${projectId}/protection-bypass${query.toString() ? `?${query}` : ''}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          generate: { secret },
        }),
      }
    );

    output.debug('Successfully generated deployment protection bypass token');
    return getAutomationBypassToken(response.protectionBypass);
  } catch (error) {
    output.debug(
      `Failed to generate deployment protection bypass token: ${error}`
    );
    // If we can't get a deployment protection token, continue without it
    // The request might still work if the deployment isn't protected
    return null;
  }
}

function getAutomationBypassToken(
  protectionBypass: Project['protectionBypass']
): string | null {
  const bypasss = Object.keys(protectionBypass || {}).find(
    key => protectionBypass?.[key].scope === 'automation-bypass'
  );

  if (bypasss) {
    return bypasss;
  }

  return null;
}

async function getDeploymentProtectionToken(
  client: Client,
  project: Project
): Promise<string | null> {
  if (
    project.protectionBypass &&
    Object.values(project.protectionBypass).length
  ) {
    const protectionBypass = getAutomationBypassToken(project.protectionBypass);
    if (protectionBypass) {
      return protectionBypass;
    }
  }

  // generate a new token if no automation-bypass token is found
  const token = await generateDeploymentProtectionToken(client, project.id);
  // this seems to take a sec to propagate to proxy, so we wait a sec
  // sleep for 1s
  await new Promise(resolve => setTimeout(resolve, 1000));
  return token;
}

export default async function curl(client: Client) {
  // Check for help flag
  if (client.argv.includes('--help') || client.argv.includes('-h')) {
    output.print(help(curlCommand, { columns: client.stderr.columns }));
    return 0;
  }

  // Get the linked project to determine the deployment URL
  const linkedProject = await getLinkedProject(client, client.cwd);

  if (linkedProject.status !== 'linked') {
    output.error('This command requires a linked project. Please run:');
    output.print('  vercel link');
    return 1;
  }

  if (!linkedProject.project || !linkedProject.org) {
    output.error('Failed to get project information');
    return 1;
  }

  const deploymentProtectionToken = await getDeploymentProtectionToken(
    client,
    linkedProject.project
  );

  // Parse environment flags
  const args = client.argv.slice(2);
  const flags: {
    '--prod'?: boolean;
    '--environment'?: string;
    '--sha'?: string;
  } = {};

  // Extract environment flags
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--prod' || arg === '--production') {
      flags['--prod'] = true;
    } else if (arg === '--environment' && i + 1 < args.length) {
      flags['--environment'] = args[i + 1];
    } else if (arg === '--sha' && i + 1 < args.length) {
      flags['--sha'] = args[i + 1];
    }
  }

  const target = parseTarget({
    flagName: 'environment',
    flags,
  });

  // Get deployment URL based on SHA or target
  let baseUrl: string;
  if (flags['--sha']) {
    const deploymentUrl = await getDeploymentUrlBySha(
      client,
      linkedProject.project.id,
      flags['--sha']
    );
    if (!deploymentUrl) {
      output.error(`No deployment found for SHA "${flags['--sha']}"`);
      return 1;
    }
    baseUrl = deploymentUrl;
  } else if (target) {
    const deploymentUrl = await getDeploymentUrl(
      client,
      linkedProject.project.id,
      target
    );
    if (!deploymentUrl) {
      output.error(`No deployment found for environment "${target}"`);
      return 1;
    }
    baseUrl = deploymentUrl;
  } else {
    // Fallback to project URL
    baseUrl = `https://${linkedProject.project.name}-${linkedProject.org.slug}.vercel.app`;
  }

  // Filter out environment, cwd flags, and the curl command name from args
  const curlArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Skip the command name 'curl' wherever it appears
    if (arg === 'curl') {
      continue;
    }

    if (arg === '--prod' || arg === '--production') {
      // Skip this flag
      continue;
    } else if (arg === '--environment' || arg === '--cwd' || arg === '--sha') {
      // Skip this flag and its value
      i++; // Skip the next argument too
      continue;
    }
    curlArgs.push(arg);
  }

  // Find the first argument that looks like a path or URL (doesn't start with '-')
  let pathIndex = -1;
  let path = '/';

  for (let i = 0; i < curlArgs.length; i++) {
    const arg = curlArgs[i];
    // Skip flags and their values
    if (arg.startsWith('-')) {
      // Skip flag values for flags that take arguments
      if (
        [
          '-d',
          '--data',
          '-H',
          '--header',
          '-X',
          '--request',
          '-o',
          '--output',
          '-w',
          '--write-out',
        ].includes(arg)
      ) {
        i++; // Skip the next argument as it's the value for this flag
      }
      continue;
    }
    // This is likely the path/URL argument
    pathIndex = i;
    path = arg;
    break;
  }

  // Check if path is already a full URL
  const isFullUrl = path.startsWith('http://') || path.startsWith('https://');

  if (isFullUrl) {
    // If it's already a full URL, use it as-is
    if (pathIndex >= 0) {
      curlArgs[pathIndex] = path;
    } else {
      curlArgs.unshift(path);
    }
  } else {
    // Build the full URL from base URL and path
    const fullUrl = path.startsWith('/')
      ? `${baseUrl}${path}`
      : `${baseUrl}/${path}`;

    // Replace the path with the full URL
    if (pathIndex >= 0) {
      curlArgs[pathIndex] = fullUrl;
    } else {
      // No path specified, add the base URL
      curlArgs.unshift(baseUrl);
    }
  }

  // Add deployment protection bypass token if available
  if (deploymentProtectionToken) {
    output.debug('Adding deployment protection bypass token header');
    curlArgs.push(
      '-H',
      `x-vercel-protection-bypass: ${deploymentProtectionToken}`
    );
  }

  // Execute curl command
  return new Promise<number>(resolve => {
    const curlProcess = spawn('curl', curlArgs, {
      stdio: 'inherit',
    });

    curlProcess.on('close', code => {
      resolve(code || 0);
    });

    curlProcess.on('error', error => {
      output.error(`Failed to execute curl: ${error.message}`);
      resolve(1);
    });
  });
}
