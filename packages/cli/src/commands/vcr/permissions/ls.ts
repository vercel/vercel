import chalk from 'chalk';
import type Client from '../../../util/client';
import table from '../../../util/output/table';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import { isAPIError } from '../../../util/errors-ts';
import {
  outputError,
  validateOptionalIntegerRange,
} from '../../../util/command-validation';
import { outputAgentError } from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import type { VcrTelemetryClient } from '../../../util/telemetry/commands/vcr';
import { permissionsLsSubcommand } from './command';
import { resolveVcrScope } from '../utils/resolve-vcr-scope';
import { formatRelativeTime } from '../utils/format';
import {
  requireVcrRepository,
  validateVcrJsonOutput,
} from '../utils/validators';
import { emitVcrArgParseError, handleVcrApiError } from '../utils/errors';
import { repositoryPermissionsPath } from '../utils/paths';
import type { RepositoryPermissionList } from './team-refs';

function printPermissions(list: RepositoryPermissionList): void {
  if (list.permissions.length === 0) {
    output.log('This repository has not been shared with any teams.');
    return;
  }

  const headers = ['Team', 'Added'].map(h => chalk.cyan(h));
  const rows = [
    headers,
    ...list.permissions.map(permission => [
      chalk.bold(permission.teamSlug),
      formatRelativeTime(permission.createdAt),
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
      `More results available. Re-run with \`--cursor ${list.nextCursor}\`.`
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
      getFlagsSpecification(permissionsLsSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(
      client,
      err,
      'vcr permissions <repository> ls --project <name-or-id>'
    );
    printError(err);
    return 1;
  }

  const fr = validateVcrJsonOutput(client, parsedArgs.flags);
  if (typeof fr === 'number') {
    return fr;
  }

  const repository = parsedArgs.args[0];
  const project = parsedArgs.flags['--project'] as string | undefined;
  const cursor = parsedArgs.flags['--cursor'] as string | undefined;
  const limitFlag = parsedArgs.flags['--limit'] as number | undefined;

  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionLimit(limitFlag);
  telemetry.trackCliOptionCursor(cursor);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  const missingRepository = requireVcrRepository(
    client,
    repository,
    fr.jsonOutput,
    'vcr permissions <repository> ls'
  );
  if (typeof missingRepository === 'number') {
    return missingRepository;
  }

  const limitResult = validateOptionalIntegerRange(limitFlag, {
    flag: '--limit',
    min: 1,
    max: 100,
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

  const path = repositoryPermissionsPath(scope, repository, {
    // A repository can be shared with at most 100 teams, so a full page
    // always contains every permission.
    limit: limitResult.value ?? 100,
    cursor,
  });
  output.spinner('Fetching repository permissions...');
  try {
    const list = await client.fetch<RepositoryPermissionList>(path);
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
    } else {
      printPermissions(list);
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
