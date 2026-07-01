import chalk from 'chalk';
import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import { isAPIError } from '../../../util/errors-ts';
import type { VcrTelemetryClient } from '../../../util/telemetry/commands/vcr';
import { imageInspectSubcommand } from './command';
import { resolveVcrScope } from '../utils/resolve-vcr-scope';
import {
  requireVcrRepositoryAndImageId,
  validateVcrJsonOutput,
} from '../utils/validators';
import { emitVcrArgParseError, handleVcrApiError } from '../utils/errors';
import { imagePath } from '../utils/paths';

export default async function inspect(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(imageInspectSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(
      client,
      err,
      'vcr image inspect <repository> <imageId> --project <name-or-id>'
    );
    printError(err);
    return 1;
  }

  const fr = validateVcrJsonOutput(client, parsedArgs.flags);
  if (typeof fr === 'number') {
    return fr;
  }

  const repository = parsedArgs.args[0];
  const imageId = parsedArgs.args[1];
  const project = parsedArgs.flags['--project'] as string | undefined;
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  const missingArgs = requireVcrRepositoryAndImageId(
    client,
    repository,
    imageId,
    fr.jsonOutput,
    'vcr image inspect <repository> <imageId>'
  );
  if (typeof missingArgs === 'number') {
    return missingArgs;
  }

  const scope = await resolveVcrScope(client, {
    project,
    jsonOutput: fr.jsonOutput,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const path = imagePath(scope, repository, imageId);
  output.spinner('Fetching image...');
  try {
    const result = await client.fetch<Record<string, unknown>>(path);
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      output.log(`${chalk.bold('Image')} ${chalk.cyan(imageId)}`);
      client.stdout.write(
        `${JSON.stringify(result.image ?? result, null, 2)}\n`
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
