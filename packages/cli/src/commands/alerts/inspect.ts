import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { inspectSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import getScope from '../../util/get-scope';
import { getLinkedProject } from '../../util/projects/link';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { isAPIError, ProjectNotFound } from '../../util/errors-ts';
import {
  outputError,
  handleValidationError,
  validateAllProjectMutualExclusivity,
} from '../../util/command-validation';
import chalk from 'chalk';

type AlertScope = { teamId: string; projectId?: string };

async function resolveInspectScope(
  client: Client,
  flags: {
    '--project'?: string;
    '--all'?: boolean;
  },
  jsonOutput: boolean
): Promise<AlertScope | number> {
  const mutual = validateAllProjectMutualExclusivity(
    flags['--all'],
    flags['--project']
  );
  if (!mutual.valid) {
    return handleValidationError(mutual, jsonOutput, client);
  }

  if (flags['--all']) {
    const { team } = await getScope(client);
    if (!team) {
      return outputError(
        client,
        jsonOutput,
        'NO_TEAM',
        'No team context found. Run `vercel switch` to select a team, or use `vercel link`.'
      );
    }
    return { teamId: team.id };
  }

  if (flags['--project']) {
    const { team } = await getScope(client);
    if (!team) {
      return outputError(
        client,
        jsonOutput,
        'NO_TEAM',
        'No team context found. Run `vercel switch` to select a team.'
      );
    }
    try {
      const p = await getProjectByNameOrId(client, flags['--project'], team.id);
      if (p instanceof ProjectNotFound) {
        return outputError(
          client,
          jsonOutput,
          'PROJECT_NOT_FOUND',
          `Project "${flags['--project']}" was not found.`
        );
      }
      return { teamId: team.id, projectId: p.id };
    } catch (err) {
      if (isAPIError(err)) {
        return outputError(
          client,
          jsonOutput,
          err.code || 'API_ERROR',
          err.serverMessage || `API error (${err.status}).`
        );
      }
      throw err;
    }
  }

  const linked = await getLinkedProject(client);
  if (linked.status === 'error') {
    return linked.exitCode;
  }
  if (linked.status === 'not_linked') {
    return outputError(
      client,
      jsonOutput,
      'NOT_LINKED',
      'No linked project. Run `vercel link` or pass --project <name> or --all.'
    );
  }
  return {
    teamId: linked.org.id,
    projectId: linked.project.id,
  };
}

export default async function inspect(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const spec = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, spec);
  } catch (e) {
    printError(e);
    return 1;
  }

  const groupId = parsedArgs.args[0];
  const fr = validateJsonOutput(parsedArgs.flags);
  if (!fr.valid) {
    output.error(fr.error);
    return 1;
  }

  if (!groupId) {
    return outputError(
      client,
      fr.jsonOutput,
      'MISSING_ARGUMENTS',
      'Usage: `vercel alerts inspect <groupId>`'
    );
  }

  const scope = await resolveInspectScope(
    client,
    {
      '--project': parsedArgs.flags['--project'] as string | undefined,
      '--all': parsedArgs.flags['--all'] as boolean | undefined,
    },
    fr.jsonOutput
  );
  if (typeof scope === 'number') {
    return scope;
  }

  const query = new URLSearchParams({ teamId: scope.teamId });
  if (scope.projectId) {
    query.set('projectId', scope.projectId);
  }

  const path = `/alerts/v3/groups/${encodeURIComponent(groupId)}?${query.toString()}`;
  output.spinner('Fetching alert group...');
  try {
    const group = await client.fetch<Record<string, unknown>>(path);
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify({ group }, null, 2)}\n`);
    } else {
      output.log(`${chalk.bold('Alert group')} ${chalk.cyan(groupId)}`);
      client.stdout.write(`${JSON.stringify(group, null, 2)}\n`);
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      return outputError(
        client,
        fr.jsonOutput,
        err.code || 'API_ERROR',
        err.serverMessage || `API error (${err.status}).`
      );
    }
    throw err;
  } finally {
    output.stopSpinner();
  }
}
