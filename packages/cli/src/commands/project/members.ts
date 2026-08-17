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
import { membersSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { packageName } from '../../util/pkg-name';
import getCommandFlags from '../../util/get-command-flags';
import cmd from '../../util/output/cmd';
import { quoteArg } from '../../util/flags/quote-arg';

interface ProjectMember {
  uid: string;
  username?: string;
  email?: string;
  role?: string;
  computedProjectRole?: string;
  teamRole?: string;
}

interface ProjectMembersResponse {
  members: ProjectMember[];
  pagination?: {
    count?: number;
    hasNext?: boolean;
    next?: number | null;
    prev?: number | null;
  };
}

export default async function members(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(membersSubcommand.options);
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
      'Invalid number of arguments. Usage: `vercel project members [name]`'
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
  const next = parsedArgs.flags['--next'];
  if (typeof next !== 'undefined' && !Number.isInteger(next)) {
    output.error('`--next` must be a number.');
    return 1;
  }

  let result: ProjectMembersResponse;
  try {
    const project = await getProjectByCwdOrLink({
      client,
      commandName: 'project members',
      projectNameOrId: parsedArgs.args[0],
      forReadOnlyCommand: true,
    });

    const query = new URLSearchParams();
    if (parsedArgs.flags['--search']) {
      query.set('search', String(parsedArgs.flags['--search']));
    }
    if (typeof limit === 'number') {
      query.set('limit', String(limit));
    }
    if (typeof next === 'number') {
      query.set('until', String(next));
    }

    const qs = query.toString();
    const path = `/v1/projects/${encodeURIComponent(project.id)}/members${
      qs ? `?${qs}` : ''
    }`;
    result = await client.fetch<ProjectMembersResponse>(path);
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'members' });
    printError(err);
    return 1;
  }

  const projectMembers = result.members || [];

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ members: projectMembers, pagination: result.pagination }, null, 2)}\n`
    );
    return 0;
  }

  const rows = [
    ['uid', 'Identity', 'Role', 'Team Role'].map(str => gray(str)),
    ...projectMembers.map(member => [
      member.uid,
      member.username || member.email || '',
      member.computedProjectRole || member.role || '',
      member.teamRole || '',
    ]),
  ];
  client.stderr.write(`${table(rows, { hsep: 3 })}\n`);

  if (result.pagination?.next) {
    const flags = getCommandFlags(parsedArgs.flags, [
      '_',
      '--next',
      '-N',
      '--search',
    ]);
    const projectName = parsedArgs.args[0]
      ? ` ${quoteArg(parsedArgs.args[0])}`
      : '';
    const search = parsedArgs.flags['--search'];
    const searchFlag = search ? ` --search ${quoteArg(String(search))}` : '';
    const nextCmd = `${packageName} project members${projectName}${flags}${searchFlag} --next ${result.pagination.next}`;
    output.log(`To display the next page run ${cmd(nextCmd)}`);
  }

  return 0;
}
