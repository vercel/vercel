import { gray } from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  buildCommandWithGlobalFlags,
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { checksSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import type { PaginationOptions } from '@vercel-internals/types';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { checksAdd } from './checks-add';
import { checksRemove } from './checks-remove';
const BLOCKING_STAGES = [
  'build-start',
  'deployment-start',
  'deployment-alias',
  'deployment-promotion',
  'none',
] as const;

interface ProjectChecksResponse {
  checks?: Array<Record<string, unknown>>;
  pagination?: PaginationOptions;
}

export default async function checks(
  client: Client,
  argv: string[]
): Promise<number> {
  if (argv[0] === 'add') {
    return checksAdd(client, argv.slice(1));
  }

  if (argv[0] === 'remove' || argv[0] === 'rm') {
    return checksRemove(client, argv.slice(1));
  }

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(checksSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }

  if (
    typeof parsedArgs.flags['--file'] === 'string' ||
    typeof parsedArgs.flags['--check-name'] === 'string' ||
    typeof parsedArgs.flags['--requires'] === 'string'
  ) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message:
          'To create a check, run `vercel project checks add [name]` with `--file` or `--check-name` / `--requires`.',
        hint: 'Use `project checks add`, not `project checks`, when passing create flags.',
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project checks add <name>'
            ),
            when: 'Create a check (replace <name> or omit if linked)',
          },
        ],
      },
      2
    );
    output.error(
      'To create a check, run `vercel project checks add [name]` with `--file` or `--check-name` / `--requires`. See `vercel project checks --help`.'
    );
    return 2;
  }

  if (parsedArgs.args.length > 1) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message:
          'Invalid number of arguments. Usage: `vercel project checks [name]`',
      },
      2
    );
    output.error(
      'Invalid number of arguments. Usage: `vercel project checks [name]`'
    );
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: formatResult.error,
        },
        1
      );
    }
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput || Boolean(client.nonInteractive);

  const blocksFlag = parsedArgs.flags['--blocks'];
  if (typeof blocksFlag === 'string') {
    if (
      !BLOCKING_STAGES.includes(blocksFlag as (typeof BLOCKING_STAGES)[number])
    ) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: `\`--blocks\` must be one of: ${BLOCKING_STAGES.join(', ')}`,
        },
        1
      );
      output.error(
        `\`--blocks\` must be one of: ${BLOCKING_STAGES.join(', ')}`
      );
      return 1;
    }
  }

  let result: ProjectChecksResponse;
  try {
    const project = await getProjectByCwdOrLink({
      client,
      commandName: 'project checks',
      projectNameOrId: parsedArgs.args[0],
      forReadOnlyCommand: true,
    });

    const query = new URLSearchParams();
    if (typeof blocksFlag === 'string') {
      query.set('blocks', blocksFlag);
    }
    const qs = query.toString();
    result = await client.fetch<ProjectChecksResponse>(
      `/v2/projects/${encodeURIComponent(project.id)}/checks${qs ? `?${qs}` : ''}`
    );
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'checks' });
    printError(err);
    return 1;
  }

  const list = result.checks ?? [];

  if (asJson) {
    if (client.nonInteractive) {
      const payload = {
        status: AGENT_STATUS.OK,
        checks: list,
        pagination: result.pagination,
        message:
          list.length === 0
            ? 'No checks configured for this project.'
            : `${list.length} deployment check(s) configured.`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project checks add <name>'
            ),
            when: 'Add a deployment check (replace <name> or omit if linked)',
          },
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project checks remove <check_id>'
            ),
            when: 'Remove a check after replacing <check_id> with an id from checks',
          },
        ],
      };
      client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
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
