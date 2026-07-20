import chalk from 'chalk';
import { isErrnoException } from '@vercel/error-utils';
import type Client from '../../util/client';
import output from '../../output-manager';
import { ensureLink } from '../../util/link/ensure-link';
import getScope from '../../util/get-scope';
import { getOrCreateDeploymentProtectionToken } from './bypass-token';
import { getLinkedProject } from '../../util/projects/link';
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
import getDeployment from '../../util/get-deployment';
import { getDeploymentUrlById } from './deployment-url';
import {
  GLOBAL_CLI_FLAG_NAMES,
  globalCliFlagTakesValue,
} from '../../util/arg-common';

export interface DeploymentUrlOptions {
  deploymentFlag?: string;
  protectionBypassFlag?: string;
  autoConfirm?: boolean;
}

export interface DeploymentUrlResult {
  fullUrl: string;
  deploymentProtectionToken: string | null;
  link: ProjectLinked | null;
}

export interface CommandSetupResult {
  path: string;
  isFullUrl: boolean;
  deploymentFlag?: string;
  protectionBypassFlag?: string;
  toolFlags: string[];
  yes: boolean;
  trace: boolean;
  json: boolean;
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

async function ensureLinkedProject(
  client: Client,
  commandName: string,
  autoConfirm?: boolean
): Promise<ProjectLinked | number> {
  let ensuredLink;
  try {
    ensuredLink = await ensureLink(commandName, client, client.cwd, {
      autoConfirm,
    });
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'NOT_AUTHORIZED') {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  if (typeof ensuredLink === 'number') {
    return ensuredLink;
  }

  const linkedProject = await getLinkedProject(client, { cwd: client.cwd });
  if (linkedProject.status !== 'linked') {
    output.error('This command requires a linked project. Please run:');
    output.print('  vercel link');
    return 1;
  }

  return linkedProject;
}

const VC_STRING_FLAGS = new Set(['--deployment', '--protection-bypass']);
const VC_BOOLEAN_FLAGS = new Set(['--yes', '--help', '--trace', '--json']);
const VC_GLOBAL_LONG_FLAGS = new Set(
  [...GLOBAL_CLI_FLAG_NAMES].filter(name => name.startsWith('--'))
);

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

// Help and version requests must reach parseCurlLikeArgs (via the
// command-token-not-found fallback) instead of being skipped, so
// `vercel --help curl` still prints help rather than running the command.
const PRE_COMMAND_KEEP_FLAGS = new Set(['--help', '-h', '--version', '-v']);

export function getArgsAfterCommand(
  rawArgs: string[],
  commandName: string
): string[] {
  let commandIndex = 0;

  // Before the command token every flag belongs to the root CLI, so short
  // forms (-t, -S, ...) are skipped too. After the command token only long
  // globals are stripped, since short flags there are tool flags (curl -d).
  while (commandIndex < rawArgs.length) {
    const arg = rawArgs[commandIndex];
    const name = flagName(arg);
    if (!GLOBAL_CLI_FLAG_NAMES.has(name) || PRE_COMMAND_KEEP_FLAGS.has(name)) {
      break;
    }

    commandIndex++;
    if (
      !arg.includes('=') &&
      globalCliFlagTakesValue(name) &&
      commandIndex < rawArgs.length
    ) {
      commandIndex++;
    }
  }

  return rawArgs[commandIndex] === commandName
    ? rawArgs.slice(commandIndex + 1)
    : [...rawArgs];
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
  trace: boolean;
  json: boolean;
  toolFlags: string[];
} {
  const result = {
    target: undefined as string | undefined,
    deployment: undefined as string | undefined,
    protectionBypass: undefined as string | undefined,
    yes: false,
    help: false,
    trace: false,
    json: false,
    toolFlags: [] as string[],
  };
  const args = getArgsAfterCommand(rawArgs, commandName);
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
      } else if (name === '--trace') {
        result.trace = true;
      } else if (name === '--json') {
        result.json = true;
      } else {
        result.help = true;
      }
      continue;
    }

    if (VC_GLOBAL_LONG_FLAGS.has(name)) {
      const value = flagValue(beforeSeparator, i);
      if (
        !arg.includes('=') &&
        globalCliFlagTakesValue(name) &&
        value !== undefined
      ) {
        i++;
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
  options: { allowFullUrl?: boolean; args?: string[] } = {}
): CommandSetupResult | number {
  const { print } = output;

  if (options.allowFullUrl) {
    const parsed = parseCurlLikeArgs(
      options.args ?? client.argv.slice(2),
      command.name
    );

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
      trace: parsed.trace,
      json: parsed.json,
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
    trace: !!flags['--trace'],
    json: !!flags['--json'],
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
): Promise<{
  fullUrl: string;
  deploymentProtectionToken: string | null;
  link: ProjectLinked | null;
}> {
  if (protectionBypassFlag) {
    return {
      fullUrl,
      deploymentProtectionToken: protectionBypassFlag,
      link: null,
    };
  }

  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    output.debug('Using protection bypass secret from environment variable');
    return {
      fullUrl,
      deploymentProtectionToken: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      link: null,
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
    link,
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
  const suppliedProtectionBypass =
    protectionBypassFlag ?? process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  let link: ProjectLinked | null = null;
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

  let baseUrl: string;
  let allowProtectionTokenCreation = true;

  if (deploymentFlag) {
    const accountId = scope.team?.id || scope.user.id;
    const isLegacyDirectUrl =
      deploymentFlag.startsWith('http://') ||
      deploymentFlag.startsWith('https://') ||
      deploymentFlag.includes('vercel.app');
    const requestedBaseUrl = isLegacyDirectUrl
      ? await getDeploymentUrlById(client, deploymentFlag, accountId)
      : null;

    // Read (never prompt for or create) the local link. It scopes which
    // project we may mint bypass secrets on, and stays available to trace
    // creation (including cross-team links).
    const existingLink = await getLinkedProject(client, { cwd: client.cwd });
    const localLink = existingLink.status === 'linked' ? existingLink : null;

    // A caller-supplied bypass already provides everything needed to access
    // the target. Preserve the legacy URL/ID resolver here so using a bypass
    // never adds a project lookup or requires a linked directory.
    if (suppliedProtectionBypass) {
      const deploymentUrl =
        requestedBaseUrl ??
        (await getDeploymentUrlById(client, deploymentFlag, accountId));
      if (!deploymentUrl) {
        output.error(`No deployment found for ID "${deploymentFlag}"`);
        return 1;
      }
      baseUrl = deploymentUrl;
      link = localLink;
    } else {
      const deploymentSelector =
        deploymentFlag.includes('.') || deploymentFlag.startsWith('dpl_')
          ? deploymentFlag
          : `dpl_${deploymentFlag}`;
      let resolvedBaseUrl: string | null = null;
      let deployment: Deployment | null = null;

      try {
        deployment = await getDeployment(
          client,
          scope.contextName,
          deploymentSelector
        );
      } catch (err) {
        output.debug(`Failed to resolve deployment: ${err}`);
      }

      if (deployment?.url) {
        resolvedBaseUrl = requestedBaseUrl ?? `https://${deployment.url}`;
      }

      if (deployment?.projectId && deployment.ownerId) {
        try {
          const project = await client.fetch<Project>(
            `/v9/projects/${encodeURIComponent(deployment.projectId)}`,
            { accountId: deployment.ownerId }
          );
          link = {
            status: 'linked',
            project,
            org: orgFromOwner(deployment.ownerId, scope.contextName),
          };
        } catch (err) {
          output.debug(`Failed to resolve deployment project: ${err}`);
        }
      } else if (deployment) {
        output.debug(
          `Deployment "${deploymentFlag}" is missing project metadata`
        );
      }

      if (link && resolvedBaseUrl) {
        baseUrl = resolvedBaseUrl;
        // Creating a bypass secret is a remote mutation; only do it on the
        // project linked to this directory. Other projects reuse existing
        // secrets or go without.
        allowProtectionTokenCreation =
          localLink?.project.id === link.project.id;
      } else {
        // Preserve legacy target resolution, then reuse an existing link for
        // protection settings when available. Never link for an explicit
        // target, and validate it before considering the linked fallback.
        const legacyBaseUrl =
          resolvedBaseUrl ??
          requestedBaseUrl ??
          (await getDeploymentUrlById(client, deploymentFlag, accountId));
        if (!legacyBaseUrl) {
          output.error(`No deployment found for ID "${deploymentFlag}"`);
          return 1;
        }

        link = link ?? localLink;
        // The fallback target was not verified against a resolved deployment,
        // so never mint a secret for it unless the deployment metadata proves
        // the target belongs to the locally linked project. Existing secrets
        // may still be reused.
        allowProtectionTokenCreation =
          deployment?.projectId != null &&
          deployment.projectId === localLink?.project.id;
        baseUrl = legacyBaseUrl;
      }
    }
  } else {
    const linkedProject = await ensureLinkedProject(
      client,
      commandName,
      autoConfirm
    );
    if (typeof linkedProject === 'number') {
      return linkedProject;
    }
    link = linkedProject;
    /** this is a url like `test-express-5.vercel.app` */
    const preferredAlias = link.project.targets?.production?.alias?.[0];
    /**
     * this is a url like `test-express-5-yw3u1f2bj-uncurated-tests.vercel.app`
     *
     * we're using it as a fallback because as a deployment rolls out there can be a race on getting the `preferredAlias`
     */
    const backupAlias = link.project.latestDeployments?.[0]?.url;
    const target = preferredAlias || backupAlias;
    if (!target) {
      throw new Error('No deployment URL found for the project');
    }
    baseUrl = `https://${target}`;
  }

  const fullUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  output.debug(`${chalk.cyan('Target URL:')} ${chalk.bold(fullUrl)}`);

  // Get or create protection bypass secret
  let deploymentProtectionToken: string | null =
    suppliedProtectionBypass ?? null;

  if (!deploymentProtectionToken && link?.project.id) {
    try {
      deploymentProtectionToken = await getOrCreateDeploymentProtectionToken(
        client,
        link,
        { createIfMissing: allowProtectionTokenCreation }
      );
    } catch (err) {
      const message = `Failed to get deployment protection bypass token: ${err instanceof Error ? err.message : String(err)}`;
      if (deploymentFlag) {
        output.warn(
          `${message}. Continuing without a bypass header; pass --protection-bypass <secret> if this deployment is protected.`
        );
      } else {
        output.error(message);
        return 1;
      }
    }
  }

  return {
    fullUrl,
    deploymentProtectionToken,
    link,
  };
}
