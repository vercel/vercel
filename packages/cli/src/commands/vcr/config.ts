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
  validateVcrJsonOutput,
} from './utils/validators';
import {
  readOnOffOption,
  rewriteLegacyOnOffValues,
} from '../../util/on-off-option';
import { emitVcrArgParseError, handleVcrApiError } from './utils/errors';
import { repositoryPath } from './utils/paths';

const USAGE = 'vcr update <repository> --public';

export default async function config(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  // `--public true|false` still works.
  const rewritten = rewriteLegacyOnOffValues(
    argv,
    configSubcommand.options,
    client
  );

  // A `--public` value it never took is reported after `--json` is read, so
  // it's a JSON error with `--json`, as an invalid value always was.
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      'error' in rewritten ? argv : rewritten.args,
      getFlagsSpecification(configSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(client, err, USAGE);
    printError(err);
    return 2;
  }

  const fr = validateVcrJsonOutput(client, parsedArgs.flags);
  if (typeof fr === 'number') {
    return fr;
  }

  if ('error' in rewritten) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: rewritten.error,
      },
      2
    );
    return outputError(
      client,
      fr.jsonOutput,
      'INVALID_ARGUMENTS',
      rewritten.error
    );
  }

  const repository = parsedArgs.args[0];
  const project = parsedArgs.flags['--project'] as string | undefined;
  const visibility = readOnOffOption(client, parsedArgs.flags, {
    on: '--public',
    off: '--no-public',
  });
  if ('error' in visibility) {
    const err = new Error(visibility.error);
    emitVcrArgParseError(client, err, USAGE);
    return outputError(
      client,
      fr.jsonOutput,
      'INVALID_ARGUMENTS',
      visibility.error
    );
  }
  const desiredPublic = visibility.value;

  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliOptionPublic(rewritten.legacy.get('--public'));
  if (!rewritten.legacy.has('--public')) {
    telemetry.trackCliFlagPublic(parsedArgs.flags['--public']);
    telemetry.trackCliFlagNoPublic(parsedArgs.flags['--no-public']);
  }

  const missingRepository = requireVcrRepository(
    client,
    repository,
    fr.jsonOutput,
    USAGE
  );
  if (typeof missingRepository === 'number') {
    return missingRepository;
  }

  // `--public` takes no value, so `--public banana` must not become a second
  // argument that is quietly ignored.
  if (parsedArgs.args.length > 1) {
    const message =
      '`vcr update` takes one repository. Pass --public or --no-public without a value.';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message,
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, USAGE),
            when: 'Re-run with one repository',
          },
        ],
      },
      2
    );
    return outputError(client, fr.jsonOutput, 'INVALID_ARGUMENTS', message);
  }

  if (desiredPublic === undefined) {
    const message =
      'Missing a setting to change. Pass --public to make the repository public, or --no-public to make it private.';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message,
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, USAGE),
            when: 'Re-run with --public or --no-public',
          },
        ],
      },
      2
    );
    return outputError(client, fr.jsonOutput, 'MISSING_ARGUMENTS', message);
  }

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
