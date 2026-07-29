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
import getDeployment from '../../util/get-deployment';

export interface DeploymentUrlOptions {
  deploymentFlag?: string;
  protectionBypassFlag?: string;
  autoConfirm?: boolean;
  resolveProjectForTrace?: boolean;
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

const VC_STRING_FLAGS = new Set(['--deployment', '--protection-bypass']);
const VC_IGNORED_STRING_FLAGS = new Set(['--scope', '--team']);
const VC_BOOLEAN_FLAGS = new Set(['--yes', '--help', '--trace', '--json']);

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

function getCurlLikeArgs(rawArgs: string[], commandName: string): string[] {
  if (rawArgs[0] === commandName) {
    return rawArgs.slice(1);
  }

  // The root CLI permits --scope/--team before the command token. Skip only
  // those known prefixes; other global-flag interactions are outside this
  // command's parser and curl's short flags must remain untouched.
  let commandIndex = 0;
  while (commandIndex < rawArgs.length) {
    const arg = rawArgs[commandIndex];
    if (!VC_IGNORED_STRING_FLAGS.has(flagName(arg))) {
      break;
    }

    commandIndex++;
    if (!arg.includes('=') && commandIndex < rawArgs.length) {
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
  const args = getCurlLikeArgs(rawArgs, commandName);
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

    // These flags are parsed and applied by the root CLI. Consume them here
    // so they do not leak into the underlying curl invocation.
    if (VC_IGNORED_STRING_FLAGS.has(name)) {
      const value = flagValue(beforeSeparator, i);
      if (!arg.includes('=') && value !== undefined) {
        i++;
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

/** Shape a deployment's owning project as a ProjectLinked. Returns null when
 *  the deployment carries no project/owner ids; throws only if the project
 *  fetch itself fails. */
async function linkFromDeployment(
  client: Client,
  deployment: Deployment
): Promise<ProjectLinked | null> {
  if (!deployment.projectId || !deployment.ownerId) return null;
  const project = await client.fetch<Project>(
    `/v9/projects/${encodeURIComponent(deployment.projectId)}`,
    { accountId: deployment.ownerId }
  );
  return { status: 'linked', project, org: orgFromOwner(deployment.ownerId) };
}

/** Resolve the owning project for an explicit --deployment target, warning
 *  (and returning null) when it can't be resolved so the request proceeds
 *  without an automatic bypass token. */
async function resolveTargetProject(
  client: Client,
  deployment: Deployment,
  deploymentFlag: string
): Promise<ProjectLinked | null> {
  try {
    const link = await linkFromDeployment(client, deployment);
    if (!link) {
      output.warn(
        `Deployment "${deploymentFlag}" is missing project metadata; proceeding without an automatic protection bypass token.`
      );
    }
    return link;
  } catch (err) {
    output.debug(`Failed to resolve deployment project: ${err}`);
    output.warn(
      `Failed to load project for deployment "${deploymentFlag}"; proceeding without an automatic protection bypass token.`
    );
    return null;
  }
}

/** Deployment lookup that returns null (and logs) instead of throwing. */
async function tryGetDeployment(
  client: Client,
  contextName: string,
  selector: string
): Promise<Deployment | null> {
  try {
    return await getDeployment(client, contextName, selector);
  } catch (err) {
    output.debug(`Failed to resolve deployment: ${err}`);
    return null;
  }
}

/** Best-effort project link from a selector, for --trace context only. Any
 *  failure (lookup or project fetch) resolves to null. */
async function tryLinkFromSelector(
  client: Client,
  contextName: string,
  selector: string
): Promise<ProjectLinked | null> {
  try {
    const deployment = await getDeployment(client, contextName, selector);
    return await linkFromDeployment(client, deployment);
  } catch (err) {
    output.debug(`Failed to resolve trace project context: ${err}`);
    return null;
  }
}

/** The cwd-linked project, or null when unlinked/unreadable. */
async function getLinkedProjectOrNull(
  client: Client
): Promise<ProjectLinked | null> {
  try {
    const linked = await getLinkedProject(client, { cwd: client.cwd });
    return linked.status === 'linked' ? linked : null;
  } catch (err) {
    output.debug(`Failed to load linked project: ${err}`);
    return null;
  }
}

function hasAutomationBypassToken(project: Project): boolean {
  return Object.values(project.protectionBypass ?? {}).some(
    token => token.scope === 'automation-bypass'
  );
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
  const {
    deploymentFlag,
    protectionBypassFlag,
    autoConfirm,
    resolveProjectForTrace,
  } = options;
  const suppliedProtectionBypass = deploymentFlag
    ? (protectionBypassFlag ??
      (process.env.VERCEL_AUTOMATION_BYPASS_SECRET || undefined))
    : protectionBypassFlag;

  let link: ProjectLinked | null = null;
  let createProtectionBypassIfMissing = !deploymentFlag;
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

  if (deploymentFlag) {
    const accountId = scope.team?.id || scope.user.id;
    const isDirectUrl =
      deploymentFlag.startsWith('http://') ||
      deploymentFlag.startsWith('https://') ||
      deploymentFlag.includes('vercel.app');
    // A URL/host --deployment is resolved here via getDeploymentUrlById with no
    // network fetch. A bare id is left null and resolved later, alongside the
    // project/bypass-token lookup.
    const requestedBaseUrl = isDirectUrl
      ? await getDeploymentUrlById(client, deploymentFlag, accountId)
      : null;
    // Prefix a bare deployment id with `dpl_`; pass URLs/prefixed ids through.
    const deploymentSelector =
      deploymentFlag.includes('.') || deploymentFlag.startsWith('dpl_')
        ? deploymentFlag
        : `dpl_${deploymentFlag}`;

    if (suppliedProtectionBypass !== undefined) {
      // Token already in hand, so we only need a URL. The project is looked up
      // purely to scope a --trace session; a miss there falls back to the
      // cwd-linked project and never fails the request.
      baseUrl =
        requestedBaseUrl ??
        (await getDeploymentUrlById(client, deploymentFlag, accountId)) ??
        '';
      if (!baseUrl) {
        output.error(`No deployment found for ID "${deploymentFlag}"`);
        return 1;
      }
      if (resolveProjectForTrace) {
        link =
          (await tryLinkFromSelector(
            client,
            scope.contextName,
            deploymentSelector
          )) ?? (await getLinkedProjectOrNull(client));
      }
    } else {
      // No token: the lookup is load-bearing — it resolves the project the
      // token is sourced from, and its url is the fallback target when
      // --deployment wasn't a direct URL.
      const deployment = await tryGetDeployment(
        client,
        scope.contextName,
        deploymentSelector
      );

      baseUrl =
        requestedBaseUrl ??
        (deployment?.url ? `https://${deployment.url}` : '');
      if (!baseUrl) {
        output.error(`No deployment found for ID "${deploymentFlag}"`);
        return 1;
      }

      if (!deployment) {
        output.warn(
          `Could not resolve project information for deployment "${deploymentFlag}"; proceeding without an automatic protection bypass token.`
        );
      } else {
        link = await resolveTargetProject(client, deployment, deploymentFlag);
        // Allow creating a secret only when the explicit target IS the linked
        // project — never mint one on a project selected by --deployment.
        if (link && !hasAutomationBypassToken(link.project)) {
          const linked = await getLinkedProjectOrNull(client);
          createProtectionBypassIfMissing =
            linked?.project.id === link.project.id;
        }
      }
    }
  } else {
    // No explicit --deployment: target the linked project. `ensureLink` may
    // return a numeric exit code (aborted link / recoverable error), surfaced
    // as-is; on success we re-read it for the production alias / latest URL.
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

    if (!linkedProject.project || !linkedProject.org) {
      output.error('Failed to get project information');
      return 1;
    }

    link = ensuredLink;
    const preferredAlias =
      linkedProject.project.targets?.production?.alias?.[0];
    const backupAlias = linkedProject.project.latestDeployments?.[0]?.url;
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

  if (suppliedProtectionBypass === undefined && link?.project.id) {
    try {
      deploymentProtectionToken = await getOrCreateDeploymentProtectionToken(
        client,
        link,
        { createIfMissing: createProtectionBypassIfMissing }
      );
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
