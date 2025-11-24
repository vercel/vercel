import chalk from 'chalk';
import { isErrnoException } from '@vercel/error-utils';
import type Client from '../../util/client';
import output from '../../output-manager';
import { ensureLink } from '../../util/link/ensure-link';
import getScope from '../../util/get-scope';
import { getOrCreateDeploymentProtectionToken } from './bypass-token';
import { getLinkedProject } from '../../util/projects/link';
import { getDeploymentUrlById } from './deployment-url';
import type { ProjectLinked } from '@vercel-internals/types';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { help } from '../help';
import { getCommandName } from '../../util/pkg-name';
import type { Command } from '../help';
import type arg from 'arg';

export interface DeploymentUrlOptions {
  deploymentFlag?: string;
  protectionBypassFlag?: string;
}

export interface DeploymentUrlResult {
  fullUrl: string;
  deploymentProtectionToken: string | null;
  link: ProjectLinked;
}

export interface CommandSetupResult {
  path: string;
  deploymentFlag?: string;
  protectionBypassFlag?: string;
  toolFlags: string[];
}

export interface CommandTelemetryClient {
  trackCliArgumentPath(path: string | undefined): void;
  trackCliOptionDeployment(deploymentId: string | undefined): void;
  trackCliOptionProtectionBypass(secret: string | undefined): void;
}

/**
 * Shared setup logic for curl-like commands
 * Handles argument parsing, validation, help, and telemetry
 */
export function setupCurlLikeCommand(
  client: Client,
  command: Command,
  telemetryClient: CommandTelemetryClient
): CommandSetupResult | number {
  const { print } = output;

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(command.options) as arg.Spec;

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { flags } = parsedArgs;

  if (parsedArgs.flags['--help']) {
    print(help(command, { columns: client.stderr.columns }));
    return 2;
  }

  // Remove command name from the args list
  if (parsedArgs.args[0] === command.name) {
    parsedArgs.args.shift();
  }

  const separatorIndex = process.argv.indexOf('--');
  const path = parsedArgs.args[0];

  telemetryClient.trackCliArgumentPath(path);

  const deploymentFlag = flags['--deployment'];
  if (deploymentFlag) {
    telemetryClient.trackCliOptionDeployment(deploymentFlag);
  }

  const protectionBypassFlag = flags['--protection-bypass'];
  if (protectionBypassFlag) {
    telemetryClient.trackCliOptionProtectionBypass(protectionBypassFlag);
  }

  if (!path || path === '--' || path.startsWith('-')) {
    output.error(
      `${getCommandName(`${command.name} <path>`)} requires an API path (e.g., '/' or '/api/hello' or 'api/hello')`
    );
    print(help(command, { columns: client.stderr.columns }));
    return 1;
  }

  // Disallow passing a full URL as the path arg to avoid duplicating the base URL
  if (path.startsWith('http://') || path.startsWith('https://')) {
    output.error(
      `The <path> argument must be a relative API path (e.g., '/' or '/api/hello'), not a full URL.`
    );
    output.print(
      `To target a specific deployment within the currently linked project, use the --deployment <id|url> flag.`
    );
    print(help(command, { columns: client.stderr.columns }));
    return 1;
  }

  const toolFlags =
    separatorIndex !== -1 ? process.argv.slice(separatorIndex + 1) : [];
  output.debug(
    `${command.name} flags (${toolFlags.length} args): ${JSON.stringify(toolFlags)}`
  );

  return {
    path,
    deploymentFlag,
    protectionBypassFlag,
    toolFlags,
  };
}

/**
 * Shared logic for curl-like commands to get deployment URL and protection token
 */
export async function getDeploymentUrlAndToken(
  client: Client,
  commandName: string,
  path: string,
  options: DeploymentUrlOptions
): Promise<DeploymentUrlResult | number> {
  const { deploymentFlag, protectionBypassFlag } = options;

  let link;
  let scope;

  try {
    scope = await getScope(client);
  } catch (err: unknown) {
    if (
      isErrnoException(err) &&
      (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED')
    ) {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  try {
    link = await ensureLink(commandName, client, client.cwd);
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'NOT_AUTHORIZED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  if (typeof link === 'number') {
    return link;
  }

  const { project } = link;

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

  /** this is a url like `test-express-5.vercel.app` */
  const preferredAlias = linkedProject.project.targets?.production?.alias?.[0];
  /**
   * this is a url like `test-express-5-yw3u1f2bj-uncurated-tests.vercel.app`
   *
   * we're using it as a fallback because as a deployment rolls out there can be a race on getting the `preferredAlias`
   */
  const backupAlias = linkedProject.project.latestDeployments?.[0]?.url;
  const target = preferredAlias || backupAlias;

  let baseUrl: string;

  if (deploymentFlag) {
    // Get the accountId from the scope (team or user)
    const accountId = scope.team?.id || scope.user.id;
    const deploymentUrl = await getDeploymentUrlById(
      client,
      deploymentFlag,
      accountId
    );
    if (!deploymentUrl) {
      output.error(`No deployment found for ID "${deploymentFlag}"`);
      return 1;
    }
    baseUrl = deploymentUrl;
  } else if (target) {
    baseUrl = `https://${target}`;
  } else {
    throw new Error('No deployment URL found for the project');
  }

  const fullUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  output.debug(`${chalk.cyan('Target URL:')} ${chalk.bold(fullUrl)}`);

  // Get or create protection bypass secret
  let deploymentProtectionToken: string | null = null;

  if (project.id) {
    try {
      deploymentProtectionToken =
        protectionBypassFlag ??
        (await getOrCreateDeploymentProtectionToken(client, link));
    } catch (err) {
      output.error(
        `Failed to get deployment protection bypass token: ${err instanceof Error ? err.message : String(err)}`
      );
      return 1;
    }
  }

  return {
    fullUrl,
    deploymentProtectionToken,
    link,
  };
}
