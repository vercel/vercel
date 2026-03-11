import { isErrnoException } from '@vercel/error-utils';
import ms from 'ms';
import type { Deployment } from '@vercel-internals/types';
import type Client from '../../util/client';
import { createGitMeta } from '../../util/create-git-meta';
import { printError } from '../../util/error';
import {
  DeploymentNotFound,
  DeploymentPermissionDenied,
  InvalidDeploymentId,
  isAPIError,
} from '../../util/errors-ts';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { getCommandName } from '../../util/pkg-name';
import { getLinkedProject } from '../../util/projects/link';
import { ShareTelemetryClient } from '../../util/telemetry/commands/share';
import { getLatestDeploymentByBranch } from '../../util/deploy/get-latest-deployment-by-branch';
import toHost from '../../util/to-host';
import output from '../../output-manager';
import { help } from '../help';
import { shareCommand } from './command';

interface ProtectionBypassResponse {
  protectionBypass?: Record<string, unknown>;
}

export default async function share(client: Client): Promise<number> {
  const telemetry = new ShareTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(shareCommand.options);

  let parsedArguments;
  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  if (parsedArguments.flags['--help']) {
    telemetry.trackCliFlagHelp('share');
    output.print(help(shareCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if (parsedArguments.args[0] === shareCommand.name) {
    parsedArguments.args.shift();
  }

  const [target] = parsedArguments.args;

  if (parsedArguments.args.length > 1) {
    output.error(
      `${getCommandName('share <url|deploymentId>')} accepts at most one argument`
    );
    return 1;
  }

  telemetry.trackCliArgumentUrlOrDeploymentId(target);
  telemetry.trackCliOptionTtl(parsedArguments.flags['--ttl']);

  const ttl = parseTTL(parsedArguments.flags['--ttl']);
  if (ttl instanceof Error) {
    output.error(ttl.message);
    return 1;
  }

  let contextName: string;
  let scopeTeamId: string | undefined;
  let userId: string;

  try {
    const scope = await getScope(client);
    contextName = scope.contextName;
    scopeTeamId = scope.team?.id;
    userId = scope.user.id;
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

  let deploymentId: string;
  let baseUrl: string;
  let accountId: string;

  if (target) {
    try {
      accountId = await inferAccountId(client, scopeTeamId, userId);
      const deployment = await getDeploymentForShare(
        client,
        contextName,
        target,
        accountId
      );
      deploymentId = deployment.id;
      baseUrl = target.includes('.')
        ? `https://${toHost(target)}`
        : `https://${deployment.url}`;
    } catch (err) {
      if (err instanceof DeploymentNotFound) {
        output.error(`Deployment not found: ${target}`);
        return 1;
      }
      if (err instanceof InvalidDeploymentId) {
        output.error(`Invalid deployment ID: ${target}`);
        return 1;
      }
      if (err instanceof DeploymentPermissionDenied) {
        output.error(err.message);
        return 1;
      }
      throw err;
    }
  } else {
    const linkedProject = await getLinkedProject(client, client.cwd);
    if (linkedProject.status === 'error') {
      return linkedProject.exitCode;
    }

    if (
      linkedProject.status !== 'linked' ||
      !linkedProject.project ||
      !linkedProject.org
    ) {
      output.error(
        `No linked project found. Run ${getCommandName(
          'link'
        )} or pass a deployment URL or ID.`
      );
      return 1;
    }

    const gitMeta = await createGitMeta(
      linkedProject.repoRoot ?? client.cwd,
      linkedProject.project
    );
    const branch = gitMeta?.commitRef;

    if (!branch) {
      output.error(
        'Could not detect the current git branch. Pass a deployment URL or ID, or run this command from a git repository.'
      );
      return 1;
    }

    const branchDeployment = await getLatestDeploymentByBranch(
      client,
      linkedProject.project.id,
      branch,
      linkedProject.org.id
    );

    if (!branchDeployment) {
      const latestBranchDeployment = await getLatestDeploymentByBranch(
        client,
        linkedProject.project.id,
        branch,
        linkedProject.org.id,
        { readyOnly: false }
      );

      if (latestBranchDeployment) {
        output.error(
          `Latest deployment for branch "${branch}" is not ready: https://${latestBranchDeployment.url} (${latestBranchDeployment.readyState ?? 'UNKNOWN'}). Fix the deployment first or pass a deployment URL or ID.`
        );
        return 1;
      }

      output.error(
        `No deployments found for branch "${branch}". Deploy this branch first or pass a deployment URL or ID.`
      );
      return 1;
    }

    accountId = linkedProject.org.id;
    deploymentId = branchDeployment.id;
    baseUrl = `https://${branchDeployment.url}`;
  }

  return await createShareUrl(client, deploymentId, baseUrl, ttl, accountId);
}

async function inferAccountId(
  client: Client,
  scopeTeamId: string | undefined,
  userId: string
): Promise<string> {
  if (scopeTeamId) {
    return scopeTeamId;
  }

  try {
    const linkedProject = await getLinkedProject(client, client.cwd);
    if (linkedProject.status === 'linked' && linkedProject.org) {
      return linkedProject.org.id;
    }
  } catch {
    // Ignore link lookup failures and fall back to the user account.
  }

  return userId;
}

async function createShareUrl(
  client: Client,
  deploymentId: string,
  baseUrl: string,
  ttl: number | undefined,
  accountId: string
): Promise<number> {
  try {
    const response = await client.fetch<ProtectionBypassResponse>(
      `/v1/aliases/${encodeURIComponent(deploymentId)}/protection-bypass`,
      {
        method: 'PATCH',
        body: ttl === undefined ? '{}' : JSON.stringify({ ttl }),
        headers: {
          'Content-Type': 'application/json',
        },
        accountId,
      }
    );

    const token = extractShareToken(response);
    const shareUrl = new URL(baseUrl);
    shareUrl.pathname = '/';
    shareUrl.search = '';
    shareUrl.searchParams.set('_vercel_share', token);

    client.stdout.write(`${shareUrl.toString()}\n`);
    return 0;
  } catch (err: unknown) {
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }

    output.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

async function getDeploymentForShare(
  client: Client,
  contextName: string,
  target: string,
  accountId: string
): Promise<Deployment> {
  const hostOrId = target.includes('.') ? toHost(target) : target;

  try {
    return await client.fetch<Deployment>(
      `/v13/deployments/${encodeURIComponent(hostOrId)}`,
      { accountId }
    );
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.status === 404) {
        throw new DeploymentNotFound({ id: hostOrId, context: contextName });
      }
      if (err.status === 403) {
        throw new DeploymentPermissionDenied(hostOrId, contextName);
      }
      if (err.status === 400 && err.message.includes('`id`')) {
        throw new InvalidDeploymentId(hostOrId);
      }
    }

    throw err;
  }
}

function parseTTL(value: string | undefined): number | Error | undefined {
  if (!value) {
    return undefined;
  }

  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    if (!Number.isSafeInteger(seconds) || seconds <= 0) {
      return new Error('Invalid TTL. Provide a positive number of seconds.');
    }
    return seconds;
  }

  const duration = ms(value);
  if (duration === undefined || duration < 1000) {
    return new Error(
      'Invalid TTL. Provide a positive duration like "30m", "1h", or seconds such as "3600".'
    );
  }

  return Math.ceil(duration / 1000);
}

function extractShareToken(response: ProtectionBypassResponse): string {
  const token = response.protectionBypass
    ? Object.keys(response.protectionBypass)[0]
    : undefined;

  if (!token) {
    throw new Error('Failed to create a share token for this deployment.');
  }

  return token;
}
