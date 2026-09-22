import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { isAPIError } from '../../util/errors-ts';
import { buildCommandWithYes, outputAgentError } from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import type { VcrTelemetryClient } from '../../util/telemetry/commands/vcr';
import { removeSubcommand } from './command';
import { resolveVcrScope } from './utils/resolve-vcr-scope';
import {
  requireVcrRepository,
  validateVcrJsonOutput,
} from './utils/validators';
import { emitVcrArgParseError, handleVcrApiError } from './utils/errors';
import { repositoryPath } from './utils/paths';

export default async function rm(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(removeSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(
      client,
      err,
      'vcr rm <repository> --project <name-or-id>'
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
  const skipConfirmation = Boolean(parsedArgs.flags['--yes']);
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes'] as boolean | undefined);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  const missingRepository = requireVcrRepository(
    client,
    repository,
    fr.jsonOutput,
    'vcr rm <repository>'
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

  if (!skipConfirmation) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        message:
          'Deleting a repository deletes it and all of its images. Re-run with --yes.',
        next: [{ command: buildCommandWithYes(client.argv) }],
      },
      1
    );
    if (
      !(await client.input.confirm(
        `Delete repository ${repository} and all of its images? This cannot be undone.`,
        false
      ))
    ) {
      output.log('Canceled');
      return 0;
    }
  }

  const path = repositoryPath(scope, repository);
  output.spinner('Deleting repository...');
  try {
    await client.fetch(path, { method: 'DELETE' });
    if (fr.jsonOutput) {
      client.stdout.write(
        `${JSON.stringify({ repository, deleted: true }, null, 2)}\n`
      );
    } else {
      output.success(`Repository ${repository} deleted`);
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
