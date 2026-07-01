import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { isAPIError } from '../../util/errors-ts';
import type { VcrTelemetryClient } from '../../util/telemetry/commands/vcr';
import { inspectSubcommand } from './command';
import { resolveVcrScope } from './utils/resolve-vcr-scope';
import {
  requireVcrRepository,
  validateVcrJsonOutput,
} from './utils/validators';
import { emitVcrArgParseError, handleVcrApiError } from './utils/errors';
import { repositoryPath } from './utils/paths';

export default async function inspect(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(inspectSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(
      client,
      err,
      'vcr inspect <repository> --project <name-or-id>'
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
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  const missingRepository = requireVcrRepository(
    client,
    repository,
    fr.jsonOutput,
    'vcr inspect <repository>'
  );
  if (typeof missingRepository === 'number') {
    return missingRepository;
  }

  const scope = await resolveVcrScope(client, {
    project,
    jsonOutput: fr.jsonOutput,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const path = repositoryPath(scope, repository);
  output.spinner('Fetching repository...');
  try {
    const result = await client.fetch<Record<string, unknown>>(path);
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      output.log(`${chalk.bold('Repository')} ${chalk.cyan(repository)}`);
      client.stdout.write(
        `${JSON.stringify(result.repository ?? result, null, 2)}\n`
      );
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
