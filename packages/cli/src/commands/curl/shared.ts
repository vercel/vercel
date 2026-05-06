import chalk from 'chalk';
import { isErrnoException } from '@vercel/error-utils';
import type Client from '../../util/client';
import output from '../../output-manager';
import { ensureLink } from '../../util/link/ensure-link';
import getScope from '../../util/get-scope';
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
import { URLSearchParams } from 'url';

const TRUSTED_OIDC_HEADER = 'x-vercel-trusted-oidc-idp-token';
const PROTECTION_BYPASS_HEADER = 'x-vercel-protection-bypass';

interface AuthHeader {
  name: string;
  value: string;
}

export interface DeploymentUrlOptions {
  deploymentFlag?: string;
  protectionBypassFlag?: string;
  autoConfirm?: boolean;
}

export interface DeploymentUrlResult {
  fullUrl: string;
  authHeader: AuthHeader | null;
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

function isArgTerminator(arg: string | undefined): boolean {
  return arg === undefined || arg.startsWith('-');
}

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

function flagName(arg: string): string {
  const eqIdx = arg.indexOf('=');
  return eqIdx === -1 ? arg : arg.slice(0, eqIdx);
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

  const commandIndex = rawArgs.indexOf(commandName);
  const args =
    commandIndex === -1 ? [...rawArgs] : rawArgs.slice(commandIndex + 1);
  const separatorIndex = args.indexOf('--');
  const beforeSeparator =
    separatorIndex === -1 ? args : args.slice(0, separatorIndex);
  const afterSeparator =
    separatorIndex === -1 ? [] : args.slice(separatorIndex + 1);

  for (let i = 0; i < beforeSeparator.length; i++) {
    const arg = beforeSeparator[i];
    const name = flagName(arg);
    const eqValue = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : null;

    if (VC_STRING_FLAGS.has(name)) {
      const next = beforeSeparator[i + 1];
      const value = eqValue ?? (isArgTerminator(next) ? undefined : next);
      if (eqValue === null && value !== undefined) {
        i++;
      }
      if (name === '--deployment') result.deployment = value;
      if (name === '--protection-bypass') result.protectionBypass = value;
      continue;
    }

    if (!result.target && VC_BOOLEAN_FLAGS.has(name)) {
      if (name === '--yes') result.yes = true;
      if (name === '--help') result.help = true;
      continue;
    }

    if (!result.target && GLOBAL_STRING_FLAGS.has(name)) {
      if (eqValue === null && !isArgTerminator(beforeSeparator[i + 1])) {
        i++;
      }
      continue;
    }

    if (!result.target && GLOBAL_BOOLEAN_FLAGS.has(name)) {
      continue;
    }

    if (!result.target && name === '--url') {
      const next = beforeSeparator[i + 1];
      result.target = eqValue ?? (isArgTerminator(next) ? undefined : next);
      if (eqValue === null && result.target !== undefined) {
        i++;
      }
      continue;
    }

    if (arg.startsWith('-')) {
      result.toolFlags.push(arg);
      continue;
    }

    if (!result.target) {
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
    `${command.name} target: ${target} (fullUrl=${isFullUrl}), toolFlags (${parsed.toolFlags.length} args): ${JSON.stringify(parsed.toolFlags)}`
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

async function pullProjectOidcToken(
  client: Client,
  projectId: string,
  accountId?: string
): Promise<string | null> {
  const query = new URLSearchParams({ source: 'vercel-cli:curl' });
  try {
    const result = await client.fetch<{
      env: Record<string, string>;
      buildEnv: Record<string, string>;
    }>(`/v3/env/pull/${projectId}?${query}`, { accountId });
    return result.env.VERCEL_OIDC_TOKEN ?? null;
  } catch (err) {
    output.debug(
      `Failed to fetch project OIDC token: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

async function resolveProjectFromUrl(
  client: Client,
  fullUrl: string
): Promise<{ project: Project; ownerId: string } | null> {
  type Result = { project: Project; ownerId: string } | null;
  const host = toHost(fullUrl);

  const deploymentLookup = async (): Promise<Result> => {
    for (const useCurrentTeam of [undefined, false] as const) {
      try {
        const deployment = await client.fetch<Deployment>(
          `/v13/deployments/${encodeURIComponent(host)}`,
          { useCurrentTeam }
        );
        if (deployment?.projectId && deployment?.ownerId) {
          const project = await client.fetch<Project>(
            `/v9/projects/${encodeURIComponent(deployment.projectId)}`,
            { accountId: deployment.ownerId }
          );
          if (project) return { project, ownerId: deployment.ownerId };
        }
      } catch (err) {
        output.debug(
          `Deployment lookup failed for ${host}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    return null;
  };

  const aliasLookup = async (): Promise<Result> => {
    try {
      const teams = await getTeams(client);
      const aliasUrl = `/now/aliases/${encodeURIComponent(host)}`;
      const results = await Promise.all(
        teams.map(team =>
          client
            .fetch<{
              projectId?: string;
              ownerId?: string;
            }>(aliasUrl, { accountId: team.id })
            .catch(() => null)
        )
      );

      const alias = results.find(r => r?.projectId && r?.ownerId);
      if (alias?.projectId && alias?.ownerId) {
        const project = await client.fetch<Project>(
          `/v9/projects/${encodeURIComponent(alias.projectId)}`,
          { accountId: alias.ownerId }
        );
        if (project) return { project, ownerId: alias.ownerId };
      }
    } catch (err) {
      output.debug(
        `Alias lookup failed for ${host}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return null;
  };

  const [fromDeployment, fromAlias] = await Promise.all([
    deploymentLookup(),
    aliasLookup(),
  ]);

  return fromDeployment ?? fromAlias;
}

export async function resolveFullUrlAuthHeader(
  client: Client,
  fullUrl: string,
  protectionBypassFlag?: string
): Promise<AuthHeader | null> {
  if (protectionBypassFlag) {
    return { name: PROTECTION_BYPASS_HEADER, value: protectionBypassFlag };
  }

  const resolved = await resolveProjectFromUrl(client, fullUrl);
  if (resolved) {
    const token = await pullProjectOidcToken(
      client,
      resolved.project.id,
      resolved.ownerId
    );
    if (token) return { name: TRUSTED_OIDC_HEADER, value: token };
  }

  const linkedProject = await getLinkedProject(client, client.cwd);
  if (linkedProject.status === 'linked' && linkedProject.project) {
    const token = await pullProjectOidcToken(
      client,
      linkedProject.project.id,
      linkedProject.org.id
    );
    if (token) return { name: TRUSTED_OIDC_HEADER, value: token };
  }

  output.debug(`No OIDC token available for ${toHost(fullUrl)}`);
  return null;
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

  let authHeader: AuthHeader | null = null;

  if (project.id) {
    if (protectionBypassFlag) {
      authHeader = {
        name: PROTECTION_BYPASS_HEADER,
        value: protectionBypassFlag,
      };
    } else {
      const oidcToken = await pullProjectOidcToken(
        client,
        project.id,
        link.org.id
      );
      if (oidcToken) {
        authHeader = { name: TRUSTED_OIDC_HEADER, value: oidcToken };
      }
    }
  }

  return {
    fullUrl,
    authHeader,
    link,
  };
}
