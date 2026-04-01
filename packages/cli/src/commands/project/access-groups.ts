import { gray } from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { accessGroupsSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';

interface AccessGroupRow extends Record<string, unknown> {
  accessGroupId?: string;
  name?: string;
  slug?: string;
  role?: string;
}

interface ListAccessGroupsResponse {
  accessGroups?: AccessGroupRow[];
  pagination?: { count?: number; next?: string | null };
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

  const project = await getProjectByCwdOrLink({
    client,
    commandName: 'project access-groups',
    projectNameOrId: parsedArgs.args[0],
  });

  const query = new URLSearchParams({ projectId: project.id });
  if (parsedArgs.flags['--search']) {
    query.set('search', String(parsedArgs.flags['--search']));
  }
  if (typeof limit === 'number') {
    query.set('limit', String(limit));
  }
  const cursor = parsedArgs.flags['--cursor'];
  if (typeof cursor === 'string' && cursor.length > 0) {
    query.set('next', cursor);
  }

  const result = await client.fetch<ListAccessGroupsResponse>(
    `/v1/access-groups?${query.toString()}`
  );
  const rows = result.accessGroups ?? [];

  if (asJson) {
    client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  if (rows.length === 0) {
    output.log('No access groups for this project.');
    return 0;
  }

  const tableRows = [
    ['Name', 'ID', 'Slug', 'Role'].map(h => gray(h)),
    ...rows.map(ag => [
      String(ag.name ?? ''),
      String(ag.accessGroupId ?? ''),
      String(ag.slug ?? ''),
      String(ag.role ?? ''),
    ]),
  ];
  client.stderr.write(`${table(tableRows, { hsep: 3 })}\n`);
  if (result.pagination?.next) {
    output.log(
      `More results available. Pass ${gray('--cursor')} with the next cursor to continue.`
    );
    output.log(gray(`cursor: ${result.pagination.next}`));
  }
  return 0;
}
