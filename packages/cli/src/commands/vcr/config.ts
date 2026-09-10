import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { isAPIError } from '../../util/errors-ts';
import { outputError } from '../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import type { VcrTelemetryClient } from '../../util/telemetry/commands/vcr';
import { configSubcommand } from './command';
import { resolveVcrScope } from './utils/resolve-vcr-scope';
import {
  requireVcrRepository,
  validateVcrChoice,
  validateVcrJsonOutput,
} from './utils/validators';
import { emitVcrArgParseError, handleVcrApiError } from './utils/errors';
import { repositoryPath } from './utils/paths';

const USAGE = 'vcr config <repository> --public <true|false>';

export default async function config(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(configSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(client, err, USAGE);
    printError(err);
    return 1;
  }

  const fr = validateVcrJsonOutput(client, parsedArgs.flags);
  if (typeof fr === 'number') {
    return fr;
  }

  const repository = parsedArgs.args[0];
  const project = parsedArgs.flags['--project'] as string | undefined;
  const publicValue = parsedArgs.flags['--public'] as string | undefined;

  const invalidChoice = validateVcrChoice(
    client,
    '--public',
    publicValue,
    ['true', 'false'],
    fr.jsonOutput
  );
  if (typeof invalidChoice === 'number') {
    return invalidChoice;
  }

  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliOptionPublic(publicValue);

  const missingRepository = requireVcrRepository(
    client,
    repository,
    fr.jsonOutput,
    USAGE
  );
  if (typeof missingRepository === 'number') {
    return missingRepository;
  }

  if (publicValue === undefined) {
    const message =
      'Missing a setting to change. Pass --public true to make the repository public, or --public false to make it private.';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message,
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, USAGE),
            when: 'Re-run with --public true or --public false',
          },
        ],
      },
      1
    );
    return outputError(client, fr.jsonOutput, 'MISSING_ARGUMENTS', message);
  }

  const desiredPublic = publicValue === 'true';

  const scope = await resolveVcrScope(client, {
    project,
    jsonOutput: fr.jsonOutput,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const path = repositoryPath(scope, repository);
  output.spinner('Updating repository...');
  try {
    const updated = await client.fetch<{
      repository?: { name?: string; public?: boolean };
    }>(path, {
      method: 'PATCH',
      body: { public: desiredPublic },
    });
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify(updated, null, 2)}\n`);
    } else {
      const isPublic = updated.repository?.public ?? desiredPublic;
      output.success(
        `Repository ${updated.repository?.name ?? repository} is now ${
          isPublic ? 'public' : 'private'
        }`
      );
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      return handleVcrApiError(client, err, fr.jsonOutput, {
        retry: {
          command: buildCommandWithGlobalFlags(client.argv, 'vcr ls'),
          when: 'List repositories to confirm the name or id',
        },
      });
    }
    throw err;
  } finally {
    output.stopSpinner();
  }
}
