import chalk from 'chalk';
import { isErrnoException } from '@vercel/error-utils';
import type Client from '../../util/client';
import output from '../../output-manager';
import { ensureLink } from '../../util/link/ensure-link';
import getScope from '../../util/get-scope';
import { getOrCreateDeploymentProtectionToken } from './bypass-token';
import { getLinkedProject } from '../../util/projects/link';
import { getDeploymentUrlById } from './deployment-url';
import toHost from '../../util/to-host';
import getTeams from '../../util/teams/get-teams';
import type {
  Deployment,
  Project,
  ProjectLinked,
} from '@vercel-internals/types';
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
  autoConfirm?: boolean;
}

export interface DeploymentUrlResult {
  fullUrl: string;
  deploymentProtectionToken: string | null;
  link: ProjectLinked;
}

export interface CommandSetupResult {
  path: string;
  isFullUrl: boolean;
  deploymentFlag?: string;
  protectionBypassFlag?: string;
  toolFlags: string[];
  yes: boolean;
}

export interface CommandTelemetryClient {
  trackCliArgumentPath(path: string | undefined): void;
  trackCliOptionDeployment(deploymentId: string | undefined): void;
  trackCliOptionProtectionBypass(secret: string | undefined): void;
}

function looksLikeHostname(path: string): boolean {
  const firstSegment = path.split('/')[0];
  return firstSegment.includes('.') && !firstSegment.startsWith('.');
}

function orgFromOwner(id: string, slug = id): ProjectLinked['org'] {
  return { type: id.startsWith('team_') ? 'team' : 'user', id, slug };
}

const VC_STRING_FLAGS = new Set(['--deployment', '--protection-bypass']);
const VC_BOOLEAN_FLAGS = new Set(['--yes', '--help']);

function flagName(arg: string): string {
  const eqIdx = arg.indexOf('=');
  return eqIdx === -1 ? arg : arg.slice(0, eqIdx);
}

function flagValue(args: string[], index: number): string | undefined {
  const arg = args[index];
  const eqIdx = arg.indexOf('=');
  if (eqIdx !== -1) {
    return arg.slice(eqIdx + 1);
  }

  const next = args[index + 1];
  return next && !next.startsWith('-') ? next : undefined;
}

export function parseCurlLikeArgs(
  rawArgs: string[],
  commandName: string
): {
  target?: string;
  deployment?: string;
  protectionBypass?: string;
  yes: boolean;
  help: boolean;
  toolFlags: string[];
} {
  const result = {
    target: undefined as string | undefined,
    deployment: undefined as string | undefined,
    protectionBypass: undefined as string | undefined,
    yes: false,
    help: false,
    toolFlags: [] as string[],
  };
  const args = rawArgs[0] === commandName ? rawArgs.slice(1) : [...rawArgs];
  const separatorIndex = args.indexOf('--');
  const beforeSeparator =
    separatorIndex === -1 ? args : args.slice(0, separatorIndex);
  const afterSeparator =
    separatorIndex === -1 ? [] : args.slice(separatorIndex + 1);

  for (let i = 0; i < beforeSeparator.length; i++) {
    const arg = beforeSeparator[i];
    const name = flagName(arg);

    if (VC_STRING_FLAGS.has(name)) {
      const value = flagValue(beforeSeparator, i);
      if (!arg.includes('=') && value !== undefined) {
        i++;
      }
      if (name === '--deployment') {
        result.deployment = value;
      } else {
        result.protectionBypass = value;
      }
      continue;
    }

    if (VC_BOOLEAN_FLAGS.has(name)) {
      if (name === '--yes') {
        result.yes = true;
      } else {
        result.help = true;
      }
      continue;
    }

    if (!result.target && name === '--url') {
      const value = flagValue(beforeSeparator, i);
      if (!arg.includes('=') && value !== undefined) {
        i++;
      }
      result.target = value;
      continue;
    }

    if (!result.target && !arg.startsWith('-')) {
      result.target = arg;
    } else {
      result.toolFlags.push(arg);
    }
  }

  result.toolFlags.push(...afterSeparator);
  return result;
}

/**
 * Shared setup logic for curl-like commands
 * Handles argument parsing, validation, help, and telemetry
 */
export function setupCurlLikeCommand(
  client: Client,
  command: Command,
  telemetryClient: CommandTelemetryClient,
  options: { allowFullUrl?: boolean } = {}
): CommandSetupResult | number {
  const { print } = output;

  if (options.allowFullUrl) {
    const parsed = parseCurlLikeArgs(client.argv.slice(2), command.name);

    if (parsed.help) {
      print(help(command, { columns: client.stderr.columns }));
      return 2;
    }

    const path = parsed.target;

    telemetryClient.trackCliArgumentPath(path);

    if (parsed.deployment) {
      telemetryClient.trackCliOptionDeployment(parsed.deployment);
    }

    if (parsed.protectionBypass) {
      telemetryClient.trackCliOptionProtectionBypass(parsed.protectionBypass);
    }

    if (!path) {
      output.error(
        `${getCommandName(`${command.name} <url|path>`)} requires a URL or API path (e.g., 'https://example.vercel.app/api/hello' or '/api/hello')`
      );
      print(help(command, { columns: client.stderr.columns }));
      return 1;
    }

    let isFullUrl = path.startsWith('http://') || path.startsWith('https://');
    if (!isFullUrl && looksLikeHostname(path)) {
      isFullUrl = true;
    }

    output.debug(
      `${command.name} flags (${parsed.toolFlags.length} args): ${JSON.stringify(parsed.toolFlags)}`
    );

    return {
      path: isFullUrl && !path.startsWith('http') ? `https://${path}` : path,
      isFullUrl,
      deploymentFlag: parsed.deployment,
      protectionBypassFlag: parsed.protectionBypass,
      toolFlags: parsed.toolFlags,
      yes: parsed.yes,
    };
  }

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
    if (options.allowFullUrl) {
      output.error(
        `${getCommandName(`${command.name} <url|path>`)} requires a URL or API path (e.g., 'https://example.vercel.app/api/hello' or '/api/hello')`
      );
    } else {
      output.error(
        `${getCommandName(`${command.name} <path>`)} requires an API path (e.g., '/' or '/api/hello' or 'api/hello')`
      );
    }
    print(help(command, { columns: client.stderr.columns }));
    return 1;
  }

  let isFullUrl = path.startsWith('http://') || path.startsWith('https://');
  if (!isFullUrl && looksLikeHostname(path)) {
    isFullUrl = true;
  }

  if (isFullUrl && !options.allowFullUrl) {
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
    path: isFullUrl && !path.startsWith('http') ? `https://${path}` : path,
    isFullUrl,
    deploymentFlag,
    protectionBypassFlag,
    toolFlags,
    yes: !!flags['--yes'],
  };
}

async function resolveProjectFromUrl(
  client: Client,
  url: string
): Promise<ProjectLinked | null> {
  const host = toHost(url);

  for (const useCurrentTeam of [undefined, false] as const) {
    try {
      const deployment = await client.fetch<Deployment>(
        `/v13/deployments/${encodeURIComponent(host)}`,
        { useCurrentTeam }
      );
      if (deployment.projectId && deployment.ownerId) {
        const project = await client.fetch<Project>(
          `/v9/projects/${encodeURIComponent(deployment.projectId)}`,
          { accountId: deployment.ownerId }
        );
        return {
          status: 'linked',
          project,
          org: orgFromOwner(deployment.ownerId),
        };
      }
    } catch (err) {
      output.debug(`Deployment lookup failed for ${host}: ${err}`);
    }
  }

  try {
    const aliasUrl = `/now/aliases/${encodeURIComponent(host)}`;
    try {
      const alias = await client.fetch<{
        projectId?: string;
        ownerId?: string;
      }>(aliasUrl, { useCurrentTeam: false });
      if (alias.projectId && alias.ownerId) {
        const project = await client.fetch<Project>(
          `/v9/projects/${encodeURIComponent(alias.projectId)}`,
          { accountId: alias.ownerId }
        );
        return {
          status: 'linked',
          project,
          org: orgFromOwner(alias.ownerId),
        };
      }
    } catch (err) {
      output.debug(`User alias lookup failed for ${host}: ${err}`);
    }

    const teams = (await getTeams(client)).filter(team => !team.limited);
    for (const team of teams) {
      try {
        const alias = await client.fetch<{
          projectId?: string;
          ownerId?: string;
        }>(aliasUrl, { accountId: team.id });
        const projectId = alias.projectId;
        const ownerId = alias.ownerId || team.id;
        if (projectId) {
          const project = await client.fetch<Project>(
            `/v9/projects/${encodeURIComponent(projectId)}`,
            { accountId: ownerId }
          );
          return {
            status: 'linked',
            project,
            org: orgFromOwner(ownerId, team.slug),
          };
        }
      } catch (err) {
        output.debug(`Alias lookup failed for ${host} in ${team.slug}: ${err}`);
      }
    }
  } catch (err) {
    output.debug(`Team lookup failed for ${host}: ${err}`);
  }

  return null;
}

export async function getFullUrlAndToken(
  client: Client,
  fullUrl: string,
  protectionBypassFlag?: string
): Promise<Pick<DeploymentUrlResult, 'fullUrl' | 'deploymentProtectionToken'>> {
  if (protectionBypassFlag) {
    return { fullUrl, deploymentProtectionToken: protectionBypassFlag };
  }

  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    output.debug('Using protection bypass secret from environment variable');
    return {
      fullUrl,
      deploymentProtectionToken: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    };
  }

  const link = await resolveProjectFromUrl(client, fullUrl);
  let deploymentProtectionToken: string | null = null;

  if (link) {
    try {
      deploymentProtectionToken = await getOrCreateDeploymentProtectionToken(
        client,
        link
      );
    } catch (err) {
      output.debug(`Failed to get deployment protection bypass token: ${err}`);
    }
  }

  return {
    fullUrl,
    deploymentProtectionToken,
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
  const { deploymentFlag, protectionBypassFlag, autoConfirm } = options;

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
    link = await ensureLink(commandName, client, client.cwd, {
      autoConfirm,
    });
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
