import ms from 'ms';
import chalk from 'chalk';
import type Client from '../../util/client';
import table from '../../util/output/table';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import { isAPIError } from '../../util/errors-ts';
import {
  outputError,
  validateOptionalIntegerRange,
} from '../../util/command-validation';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import type { VcrTelemetryClient } from '../../util/telemetry/commands/vcr';
import { listSubcommand } from './command';
import { resolveVcrScope } from './resolve-vcr-scope';
import {
  emitVcrArgParseError,
  handleVcrApiError,
  repositoriesPath,
} from './util';

interface Repository {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface RepositoryList {
  repositories: Repository[];
  nextCursor?: string;
}

function relativeTime(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) {
    return '-';
  }
  return `${ms(Date.now() - time)} ago`;
}

function printRepositories(list: RepositoryList): void {
  if (list.repositories.length === 0) {
    output.log('No repositories found.');
    return;
  }

  const headers = ['Name', 'ID', 'Created'].map(h => chalk.cyan(h));
  const rows = [
    headers,
    ...list.repositories.map(repo => [
      chalk.bold(repo.name),
      chalk.dim(repo.id),
      relativeTime(repo.createdAt),
    ]),
  ];

  const tableOutput = table(rows, { hsep: 3 })
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/^/gm, '  ');
  output.print(`\n${tableOutput}\n`);

  if (list.nextCursor) {
    output.log(
      `\nMore results available. Re-run with \`--cursor ${list.nextCursor}\`.`
    );
  }
}

export default async function ls(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(listSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(client, err, 'vcr ls --project <name-or-id>');
    printError(err);
    return 1;
  }

  const fr = validateJsonOutput(parsedArgs.flags);
  if (!fr.valid) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: fr.error,
      },
      1
    );
    output.error(fr.error);
    return 1;
  }

  const project = parsedArgs.flags['--project'] as string | undefined;
  const cursor = parsedArgs.flags['--cursor'] as string | undefined;
  const limitFlag = parsedArgs.flags['--limit'] as number | undefined;

  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionLimit(limitFlag);
  telemetry.trackCliOptionCursor(cursor);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  const limitResult = validateOptionalIntegerRange(limitFlag, {
    flag: '--limit',
    min: 1,
    max: 1000,
  });
  if (!limitResult.valid) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: limitResult.message,
      },
      1
    );
    return outputError(
      client,
      fr.jsonOutput,
      limitResult.code,
      limitResult.message
    );
  }

  const scope = await resolveVcrScope(client, {
    project,
    jsonOutput: fr.jsonOutput,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const path = repositoriesPath(scope, {
    limit: limitResult.value,
    cursor,
  });
  output.spinner('Fetching repositories...');
  try {
    const list = await client.fetch<RepositoryList>(path);
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
    } else {
      printRepositories(list);
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      return handleVcrApiError(client, err, fr.jsonOutput);
    }
    throw err;
  } finally {
    output.stopSpinner();
  }
}
