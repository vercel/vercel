import chalk from 'chalk';
import { isErrnoException } from '@vercel/error-utils';
import type Client from '../../util/client';
import output from '../../output-manager';
import { ensureLink } from '../../util/link/ensure-link';
import getScope from '../../util/get-scope';
import {
  createDeploymentProtectionToken,
  getAutomationBypassToken,
  getOrCreateDeploymentProtectionToken,
} from './bypass-token';
import {
  getCachedBypassToken,
  setCachedBypassToken,
} from './bypass-token-cache';
import { getLinkedProject } from '../../util/projects/link';
import { getDeploymentUrlById } from './deployment-url';
import toHost from '../../util/to-host';
import getTeams from '../../util/teams/get-teams';
import type {
  Deployment,
  Project,
  ProjectLinked,
} from '@vercel-internals/types';
import { help } from '../help';
import { getCommandName } from '../../util/pkg-name';
import type { Command } from '../help';

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
  target: string;
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

/**
 * Detect bare hostnames like `my-app.vercel.app` or `example.com/api`
 * so they get treated as full URLs rather than relative paths.
 */
function looksLikeHostname(target: string): boolean {
  const firstSegment = target.split('/')[0];
  return firstSegment.includes('.') && !firstSegment.startsWith('.');
}

const VC_STRING_FLAGS = new Set(['--deployment', '--protection-bypass']);
const VC_BOOLEAN_FLAGS = new Set(['--yes', '--help']);

const GLOBAL_STRING_FLAGS = new Set([
  '--cwd',
  '--scope',
  '--token',
  '--team',
  '--local-config',
  '--global-config',
  '--api',
]);
const GLOBAL_BOOLEAN_FLAGS = new Set([
  '--debug',
  '--no-color',
  '--non-interactive',
  '--version',
]);

/**
 * Parse argv for curl-like commands.
 *
 * Only recognizes long-form vc flags to avoid short-flag collisions with
 * the underlying tool (e.g. curl's -d, -v, -H, -T all conflict with global
 * vc short flags). All short flags pass through untouched.
 */
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

  const sepIdx = args.indexOf('--');
  const beforeSep = sepIdx !== -1 ? args.slice(0, sepIdx) : args;
  const afterSep = sepIdx !== -1 ? args.slice(sepIdx + 1) : [];

  let i = 0;
  while (i < beforeSep.length) {
    const arg = beforeSep[i];

    const eqIdx = arg.indexOf('=');
    const flagName = eqIdx !== -1 ? arg.slice(0, eqIdx) : arg;
    const eqValue = eqIdx !== -1 ? arg.slice(eqIdx + 1) : undefined;

    if (VC_STRING_FLAGS.has(flagName)) {
      const value = eqValue ?? beforeSep[++i];
      if (flagName === '--deployment') result.deployment = value;
      if (flagName === '--protection-bypass') result.protectionBypass = value;
      i++;
      continue;
    }

    if (VC_BOOLEAN_FLAGS.has(flagName)) {
      if (flagName === '--yes') result.yes = true;
      if (flagName === '--help') result.help = true;
      i++;
      continue;
    }

    if (GLOBAL_STRING_FLAGS.has(flagName)) {
      if (eqValue === undefined) i++;
      i++;
      continue;
    }

    if (GLOBAL_BOOLEAN_FLAGS.has(flagName)) {
      i++;
      continue;
    }

    if (result.target === undefined && !arg.startsWith('-')) {
      result.target = arg;
      i++;
      continue;
    }

    result.toolFlags.push(arg);
    i++;
  }

  result.toolFlags.push(...afterSep);

  return result;
}

/**
 * Shared setup logic for curl-like commands.
 * Handles argument parsing, validation, help, and telemetry.
 */
export function setupCurlLikeCommand(
  client: Client,
  command: Command,
  telemetryClient: CommandTelemetryClient
): CommandSetupResult | number {
  const { print } = output;

  const parsed = parseCurlLikeArgs(client.argv.slice(2), command.name);

  if (parsed.help) {
    print(help(command, { columns: client.stderr.columns }));
    return 2;
  }

  const target = parsed.target;

  telemetryClient.trackCliArgumentPath(target);

  if (parsed.deployment) {
    telemetryClient.trackCliOptionDeployment(parsed.deployment);
  }

  if (parsed.protectionBypass) {
    telemetryClient.trackCliOptionProtectionBypass(parsed.protectionBypass);
  }

  if (!target) {
    output.error(
      `${getCommandName(`${command.name} <url|path>`)} requires a URL or API path (e.g., 'https://my-app.vercel.app/api/hello' or '/api/hello')`
    );
    print(help(command, { columns: client.stderr.columns }));
    return 1;
  }

  let isFullUrl = target.startsWith('http://') || target.startsWith('https://');

  if (!isFullUrl && looksLikeHostname(target)) {
    isFullUrl = true;
  }

  output.debug(
    `${command.name} target: ${target} (fullUrl=${isFullUrl}), toolFlags (${parsed.toolFlags.length}): ${JSON.stringify(parsed.toolFlags)}`
  );

  return {
    target:
      isFullUrl && !target.startsWith('http') ? `https://${target}` : target,
    isFullUrl,
    deploymentFlag: parsed.deployment,
    protectionBypassFlag: parsed.protectionBypass,
    toolFlags: parsed.toolFlags,
    yes: parsed.yes,
  };
}

/**
 * Try to resolve a Project from a full URL using multiple strategies.
 * Tries with the current team scope first (most common case), then
 * falls back to unscoped lookups for personal/cross-team resources.
 */
async function resolveProjectFromUrl(
  client: Client,
  fullUrl: string
): Promise<{ project: Project; ownerId: string } | null> {
  type Result = { project: Project; ownerId: string } | null;
  const host = toHost(fullUrl);

  const deploymentLookup = async (): Promise<Result> => {
    for (const useCurrentTeam of [undefined, false] as const) {
      try {
        const label = useCurrentTeam === false ? 'unscoped' : 'team-scoped';
        output.debug(`Trying deployment lookup (${label}) for: ${host}`);
        const deployment = await client.fetch<Deployment>(
          `/v13/deployments/${encodeURIComponent(host)}`,
          { useCurrentTeam }
        );
        if (deployment?.projectId && deployment?.ownerId) {
          output.debug(
            `Deployment hit: project=${deployment.projectId}, owner=${deployment.ownerId}`
          );
          const project = await client.fetch<Project>(
            `/v9/projects/${encodeURIComponent(deployment.projectId)}`,
            { accountId: deployment.ownerId }
          );
          if (project) return { project, ownerId: deployment.ownerId };
        }
      } catch (err) {
        output.debug(
          `Deployment lookup failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    return null;
  };

  const aliasLookup = async (): Promise<Result> => {
    try {
      const teams = await getTeams(client);
      output.debug(
        `Trying alias lookup for ${host} across ${teams.length} team(s)`
      );

      const aliasUrl = `/now/aliases/${encodeURIComponent(host)}`;
      // This will soon be a single API request when we support
      // omitting the `teamId` parameter.
      const results = await Promise.all(
        teams.map(team =>
          client
            .fetch<{
              projectId?: string;
              ownerId?: string;
              uid?: string;
              alias?: string;
            }>(aliasUrl, { accountId: team.id })
            .catch(() => null)
        )
      );

      const alias = results.find(r => r?.projectId && r?.ownerId);
      if (alias?.projectId && alias?.ownerId) {
        output.debug(
          `Alias hit: uid=${alias.uid}, project=${alias.projectId}, owner=${alias.ownerId}`
        );
        const project = await client.fetch<Project>(
          `/v9/projects/${encodeURIComponent(alias.projectId)}`,
          { accountId: alias.ownerId }
        );
        if (project) return { project, ownerId: alias.ownerId };
      }
    } catch (err) {
      output.debug(
        `Alias lookup failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return null;
  };

  const hostnameParsing = async (): Promise<Result> => {
    const vercelAppMatch = host.match(/^(.+)\.vercel\.app$/);
    if (!vercelAppMatch) return null;

    const subdomain = vercelAppMatch[1];
    try {
      const scope = await getScope(client);
      const teamSlug = scope.team?.slug;
      output.debug(
        `Parsing .vercel.app URL: subdomain=${subdomain}, teamSlug=${teamSlug}`
      );

      if (teamSlug && subdomain.endsWith(`-${teamSlug}`)) {
        const prefix = subdomain.slice(0, -(teamSlug.length + 1));
        const candidates = [prefix];
        const lastDash = prefix.lastIndexOf('-');
        if (lastDash > 0) {
          candidates.push(prefix.slice(0, lastDash));
        }

        for (const name of candidates) {
          try {
            const project = await client.fetch<Project>(
              `/v9/projects/${encodeURIComponent(name)}`
            );
            if (project?.id) {
              output.debug(
                `Project found by name: ${project.id} (${project.name})`
              );
              const ownerId = scope.team?.id || scope.user.id;
              return { project, ownerId };
            }
          } catch {
            // project name didn't match, try next candidate
          }
        }
      }
    } catch (err) {
      output.debug(
        `Hostname parsing failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return null;
  };

  // Fire all strategies in parallel, pick the first hit in priority order.
  const [fromDeployment, fromAlias, fromHostname] = await Promise.all([
    deploymentLookup(),
    aliasLookup(),
    hostnameParsing(),
  ]);

  const result = fromDeployment ?? fromAlias ?? fromHostname;
  if (result) return result;

  output.debug('All project-resolution strategies exhausted');
  return null;
}

/**
 * Resolve protection bypass when a full URL was provided.
 *
 * Priority:
 *  1. Explicit --protection-bypass flag
 *  2. VERCEL_AUTOMATION_BYPASS_SECRET env var
 *  3. Local cache
 *  4. Resolve project from URL (deployment → alias → hostname parsing)
 *
 * Best-effort: if the project can't be resolved or a token can't be
 * obtained, returns null so the request proceeds without a bypass header.
 */
export async function resolveFullUrlProtection(
  client: Client,
  fullUrl: string,
  protectionBypassFlag?: string
): Promise<string | null> {
  if (protectionBypassFlag) return protectionBypassFlag;
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    output.debug('Using protection bypass secret from environment variable');
    return process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }

  const cached = await getCachedBypassToken(fullUrl);
  if (cached) return cached;

  const resolved = await resolveProjectFromUrl(client, fullUrl);
  if (!resolved) {
    output.debug(
      `Could not resolve project for ${toHost(fullUrl)} — proceeding without bypass token`
    );
    return null;
  }

  const { project, ownerId } = resolved;
  output.debug(
    `Resolved project: ${project.id} (${project.name}), owner: ${ownerId}`
  );

  try {
    if (
      project.protectionBypass &&
      Object.keys(project.protectionBypass).length
    ) {
      const token = getAutomationBypassToken(project.protectionBypass);
      if (token) {
        output.debug(`Using existing bypass token for project ${project.id}`);
        await setCachedBypassToken(fullUrl, token, project.id);
        return token;
      }
    }

    output.debug('No existing bypass token, creating new one');
    const token = await createDeploymentProtectionToken(
      client,
      project.id,
      ownerId
    );
    await setCachedBypassToken(fullUrl, token, project.id);
    return token;
  } catch (err) {
    output.debug(
      `Could not obtain bypass token: ${err instanceof Error ? err.message : String(err)}`
    );
    output.warn(
      `Could not obtain a deployment protection bypass token for ${chalk.bold(project.name)}. If the response is 401, provide one with ${chalk.cyan('--protection-bypass <secret>')} or set ${chalk.cyan('VERCEL_AUTOMATION_BYPASS_SECRET')}.`
    );
    return null;
  }
}

/**
 * Shared logic for curl-like commands to get deployment URL and protection token.
 * Used when the user provides a relative path (not a full URL).
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

  let deploymentProtectionToken: string | null = null;

  if (project.id) {
    try {
      if (protectionBypassFlag) {
        deploymentProtectionToken = protectionBypassFlag;
      } else {
        const cached = await getCachedBypassToken(fullUrl);
        if (cached) {
          deploymentProtectionToken = cached;
        } else {
          deploymentProtectionToken =
            await getOrCreateDeploymentProtectionToken(client, link);
          if (deploymentProtectionToken) {
            await setCachedBypassToken(
              fullUrl,
              deploymentProtectionToken,
              project.id
            );
          }
        }
      }
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
