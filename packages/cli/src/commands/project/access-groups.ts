import { gray } from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { accessGroupsSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';

interface AccessGroup {
  id: string;
  name: string;
  description?: string | null;
  role?: string | null;
}

interface AccessGroupsResponse {
  accessGroups: AccessGroup[];
  pagination?: {
    count?: number;
    next?: string | null;
  };
}

export default async function accessGroups(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    accessGroupsSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }

  if (parsedArgs.args.length > 1) {
    output.error(
      'Invalid number of arguments. Usage: `vercel project access-groups [name]`'
    );
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const limit = parsedArgs.flags['--limit'];
  if (typeof limit === 'number' && (limit < 1 || limit > 100)) {
    output.error('`--limit` must be a number between 1 and 100.');
    return 1;
  }

  let result: AccessGroupsResponse;
  try {
    const project = await getProjectByCwdOrLink({
      client,
      commandName: 'project access-groups',
      projectNameOrId: parsedArgs.args[0],
      forReadOnlyCommand: true,
    });

    const query = new URLSearchParams();
    query.set('projectId', project.id);
    if (parsedArgs.flags['--search']) {
      query.set('search', String(parsedArgs.flags['--search']));
    }
    if (typeof limit === 'number') {
      query.set('limit', String(limit));
    }
    if (typeof parsedArgs.flags['--next'] === 'number') {
      query.set('next', String(parsedArgs.flags['--next']));
    }

    result = await client.fetch<AccessGroupsResponse>(
      `/v1/access-groups?${query.toString()}`
    );
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'access-groups' });
    printError(err);
    return 1;
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const rows = [
    ['id', 'Name', 'Role'].map(str => gray(str)),
    ...(result.accessGroups || []).map(group => [
      group.id,
      group.name,
      group.role || '',
    ]),
  ];
  client.stderr.write(`${table(rows, { hsep: 3 })}\n`);
  return 0;
}
