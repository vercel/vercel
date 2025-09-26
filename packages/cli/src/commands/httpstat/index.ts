import type { Client } from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import output from '../../output-manager';
import { help } from '../help';
import { httpstatCommand } from './command';
import type {
  Deployment,
  Project,
  ProjectProtectionBypass,
} from '@vercel-internals/types';
import { httpstat, HttpstatError } from './httpstat-core';
import type { HttpstatOptions } from './httpstat-core';
import { printReport } from './reporter';

async function getDeploymentUrl(
  client: Client,
  projectId: string,
  target: string
): Promise<string | null> {
  const query = new URLSearchParams();
  if (client.config.currentTeam) {
    query.set('teamId', client.config.currentTeam);
  }

  try {
    const response = await client.fetch<{ deployments: Deployment[] }>(
      `/v6/deployments?projectId=${projectId}&target=${target}&limit=1&${query}`
    );

    if (response.deployments && response.deployments.length > 0) {
      return `https://${response.deployments[0].url}`;
    }

    return null;
  } catch (error) {
    output.debug(`Failed to get deployment for target "${target}": ${error}`);
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
  return token;
}

export default async function httpstatMain(client: Client) {
  // Check for help flag
  if (client.argv.includes('--help') || client.argv.includes('-h')) {
    output.print(help(httpstatCommand, { columns: client.stderr.columns }));
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

  // Parse command line arguments
  const args = client.argv.slice(2);
  const options: HttpstatOptions = { method: 'GET' };
  const headers: Record<string, string> = {};
  let url = '';
  let showBody = false;
  let jsonOutput = false;
  let target = '';

  // Parse arguments similar to curl/httpstat
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      continue;
    } else if (arg === '--method' || arg === '-X') {
      options.method = args[i + 1]?.toUpperCase() || 'GET';
      i++;
    } else if (arg === '--header' || arg === '-H') {
      const headerStr = args[i + 1];
      if (headerStr && headerStr.includes(':')) {
        const [key, ...valueParts] = headerStr.split(':');
        headers[key.trim()] = valueParts.join(':').trim();
      }
      i++;
    } else if (arg === '--data' || arg === '-d') {
      options.body = args[i + 1];
      if (!options.method || options.method === 'GET') {
        options.method = 'POST';
      }
      i++;
    } else if (arg === '--show-body') {
      showBody = true;
    } else if (arg === '--json-output') {
      jsonOutput = true;
    } else if (arg === '--insecure' || arg === '-k') {
      options.rejectUnauthorized = false;
    } else if (arg === '--prod' || arg === '--production') {
      target = 'production';
    } else if (arg === '--environment' || arg === '-e') {
      const targetValue = args[i + 1];
      if (targetValue) {
        target = targetValue;
      }
      i++;
    } else if (arg === '--cwd') {
      i++; // Skip the value
    } else if (arg === 'httpstat') {
      continue; // Skip command name
    } else if (!arg.startsWith('-') && !url) {
      url = arg;
    }
  }

  // Determine base URL from project
  let baseUrl: string;
  if (target) {
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
    baseUrl = `https://${linkedProject.project.name}-${linkedProject.org.slug}.vercel.app`;
  }

  // Build final URL
  if (!url) {
    url = baseUrl;
  } else if (!url.includes('://')) {
    // It's a path, prepend base URL
    if (url.startsWith('/')) {
      url = baseUrl + url;
    } else {
      url = baseUrl + '/' + url;
    }
  }

  // Add deployment protection bypass token if available
  if (deploymentProtectionToken) {
    headers['x-vercel-protection-bypass'] = deploymentProtectionToken;
  }

  options.headers = headers;

  try {
    output.debug(`Making HTTP request to: ${url}`);
    const result = await httpstat(url, options);

    printReport(result, {
      showBody,
      jsonOutput,
      noColor: client.output?.noColor || false,
    });

    return 0;
  } catch (error) {
    if (error instanceof HttpstatError) {
      output.error(`HTTP request failed: ${error.message}`);
      return 1;
    }

    output.error(`Unexpected error: ${error}`);
    return 1;
  }
}
