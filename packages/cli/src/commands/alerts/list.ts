import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { alertsCommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import { getLinkedProject } from '../../util/projects/link';
import getScope from '../../util/get-scope';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound, isAPIError } from '../../util/errors-ts';

interface ListFlags {
  '--type'?: string[];
  '--project'?: string;
  '--all'?: boolean;
  '--from'?: string;
  '--to'?: string;
  '--limit'?: number;
  '--format'?: string;
}

interface AlertsScope {
  teamId: string;
  projectId?: string;
}

interface AlertGroupAlert {
  title?: string;
}

interface AlertGroup {
  id: string;
  type: string;
  status: string;
  title?: string;
  alerts?: AlertGroupAlert[];
}

function writeJsonError(client: Client, code: string, message: string): number {
  client.stdout.write(
    `${JSON.stringify({ error: { code, message } }, null, 2)}\n`
  );
  return 1;
}

function normalizeTypeFilters(typeFilters: string[] | undefined): string[] {
  if (!typeFilters || typeFilters.length === 0) {
    return [];
  }

  const normalized = typeFilters
    .flatMap(filter => filter.split(','))
    .map(filter => filter.trim())
    .filter(Boolean);

  return [...new Set(normalized)];
}

function validateMutualExclusivity(
  all: boolean | undefined,
  project: string | undefined
): string | undefined {
  if (all && project) {
    return 'Cannot specify both --all and --project. Use one or the other.';
  }
  return undefined;
}

function getDefaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function resolveScope(
  client: Client,
  opts: { project?: string; all?: boolean }
): Promise<AlertsScope | number> {
  if (opts.all || opts.project) {
    const { team } = await getScope(client);
    if (!team) {
      output.error(
        'No team context found. Run `vercel switch` to select a team, or use `vercel link` in a project directory.'
      );
      return 1;
    }

    if (opts.all) {
      return {
        teamId: team.id,
      };
    }

    let projectResult: Awaited<ReturnType<typeof getProjectByNameOrId>>;
    try {
      projectResult = await getProjectByNameOrId(
        client,
        opts.project!,
        team.id
      );
    } catch (err) {
      if (isAPIError(err)) {
        output.error(
          err.serverMessage ||
            (err.status === 403
              ? `You do not have permission to access project "${opts.project}" in team "${team.slug}".`
              : `API error (${err.status}).`)
        );
        return 1;
      }
      throw err;
    }

    if (projectResult instanceof ProjectNotFound) {
      output.error(
        `Project "${opts.project}" was not found in team "${team.slug}".`
      );
      return 1;
    }

    return {
      teamId: team.id,
      projectId: projectResult.id,
    };
  }

  const linkedProject = await getLinkedProject(client);
  if (linkedProject.status === 'error') {
    return linkedProject.exitCode;
  }

  if (linkedProject.status === 'not_linked') {
    output.error(
      'No linked project found. Run `vercel link` to link a project, or use --project <name> or --all.'
    );
    return 1;
  }

  return {
    teamId: linkedProject.org.id,
    projectId: linkedProject.project.id,
  };
}

function getGroupTitle(group: AlertGroup): string {
  return group.title || group.alerts?.[0]?.title || 'Alert group';
}

function printGroups(groups: AlertGroup[]) {
  if (groups.length === 0) {
    output.log('No alerts found.');
    return;
  }

  output.print('');
  for (const group of groups) {
    output.log(
      `${group.status}  ${group.type}  ${getGroupTitle(group)} (${group.id})`
    );
  }
  output.print('');
}

export default async function list(client: Client): Promise<number> {
  const flagsSpecification = getFlagsSpecification(alertsCommand.options);

  let parsedArgs;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const flags = parsedArgs.flags as ListFlags;
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;

  const mutualError = validateMutualExclusivity(
    flags['--all'],
    flags['--project']
  );
  if (mutualError) {
    output.error(mutualError);
    return 1;
  }

  const scope = await resolveScope(client, {
    project: flags['--project'],
    all: flags['--all'],
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const query = new URLSearchParams({
    teamId: scope.teamId,
  });
  if (scope.projectId) {
    query.set('projectId', scope.projectId);
  }
  if (flags['--limit']) {
    query.set('limit', String(flags['--limit']));
  }
  for (const type of normalizeTypeFilters(flags['--type'])) {
    query.append('types', type);
  }
  if (flags['--from']) {
    query.set('from', flags['--from']);
  }
  if (flags['--to']) {
    query.set('to', flags['--to']);
  }
  if (!flags['--from'] && !flags['--to']) {
    const defaultRange = getDefaultRange();
    query.set('from', defaultRange.from);
    query.set('to', defaultRange.to);
  }

  const requestPath = `/alerts/v3/groups?${query.toString()}`;
  output.debug(`Fetching alerts from ${requestPath}`);

  try {
    const groups = await client.fetch<AlertGroup[]>(requestPath);

    if (jsonOutput) {
      client.stdout.write(`${JSON.stringify({ groups }, null, 2)}\n`);
    } else {
      printGroups(groups);
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      const message =
        err.status === 401 || err.status === 403
          ? 'You do not have access to alerts in this scope. Pass --token <TOKEN> and --scope <team-slug> with Alerts read access.'
          : err.status >= 500
            ? `The alerts endpoint failed on the server (${err.status}). Re-run with --debug and share the x-vercel-id from the failed request.`
            : err.serverMessage || `API error (${err.status}).`;
      if (jsonOutput) {
        return writeJsonError(client, err.code || 'API_ERROR', message);
      }
      output.error(message);
      return 1;
    }

    output.debug(err);
    const message = `Failed to fetch alerts: ${(err as Error).message || String(err)}`;
    if (jsonOutput) {
      return writeJsonError(client, 'UNEXPECTED_ERROR', message);
    }
    output.error(message);
    return 1;
  }
}
