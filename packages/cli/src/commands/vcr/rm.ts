import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import { isAPIError } from '../../util/errors-ts';
import { outputError } from '../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  buildCommandWithYes,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { packageName } from '../../util/pkg-name';
import type { VcrTelemetryClient } from '../../util/telemetry/commands/vcr';
import { removeSubcommand } from './command';
import { resolveVcrScope } from './resolve-vcr-scope';
import {
  emitVcrArgParseError,
  handleVcrApiError,
  repositoryPath,
} from './util';

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

  const repository = parsedArgs.args[0];
  const project = parsedArgs.flags['--project'] as string | undefined;
  const skipConfirmation = Boolean(parsedArgs.flags['--yes']);
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes'] as boolean | undefined);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  if (!repository) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: `Missing repository. Example: ${packageName} vcr rm <repository>`,
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, 'vcr ls'),
            when: 'List repositories to pick a name or id',
          },
        ],
      },
      1
    );
    return outputError(
      client,
      fr.jsonOutput,
      'MISSING_ARGUMENTS',
      'Usage: `vercel vcr rm <repository>`'
    );
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
          'Deleting a repository schedules it and all of its images for deletion. Re-run with --yes.',
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
        `${JSON.stringify({ repository, scheduledForDeletion: true }, null, 2)}\n`
      );
    } else {
      output.success(`Repository ${repository} scheduled for deletion`);
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
