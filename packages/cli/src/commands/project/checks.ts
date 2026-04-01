import { gray } from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { checksSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';

const BLOCKING_STAGES = [
  'build-start',
  'deployment-start',
  'deployment-alias',
  'deployment-promotion',
  'none',
] as const;

interface ProjectChecksResponse {
  checks?: Array<Record<string, unknown>>;
}

export default async function checks(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(checksSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.args.length > 1) {
    output.error(
      'Invalid number of arguments. Usage: `vercel project checks [name]`'
    );
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const blocksFlag = parsedArgs.flags['--blocks'];
  if (typeof blocksFlag === 'string') {
    if (
      !BLOCKING_STAGES.includes(blocksFlag as (typeof BLOCKING_STAGES)[number])
    ) {
      output.error(
        `\`--blocks\` must be one of: ${BLOCKING_STAGES.join(', ')}`
      );
      return 1;
    }
  }

  const project = await getProjectByCwdOrLink({
    client,
    commandName: 'project checks',
    projectNameOrId: parsedArgs.args[0],
  });

  const query = new URLSearchParams();
  if (typeof blocksFlag === 'string') {
    query.set('blocks', blocksFlag);
  }
  const qs = query.toString();
  const result = await client.fetch<ProjectChecksResponse>(
    `/v2/projects/${encodeURIComponent(project.id)}/checks${qs ? `?${qs}` : ''}`
  );
  const list = result.checks ?? [];

  if (asJson) {
    client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  if (list.length === 0) {
    output.log('No checks configured for this project.');
    return 0;
  }

  const rows = [
    ['ID', 'Name', 'Blocking', 'Target'].map(h => gray(h)),
    ...list.map(c => [
      String(c.id ?? c.checkId ?? ''),
      String(c.name ?? ''),
      String(c.blocks ?? ''),
      String(
        Array.isArray(c.environments)
          ? (c.environments as string[]).join(',')
          : (c.target ?? '')
      ),
    ]),
  ];
  client.stderr.write(`${table(rows, { hsep: 3 })}\n`);
  return 0;
}
