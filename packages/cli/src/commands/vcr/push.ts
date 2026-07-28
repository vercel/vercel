import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { outputError } from '../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import type { VcrTelemetryClient } from '../../util/telemetry/commands/vcr';
import { pushSubcommand } from './command';
import { resolveVcrScope } from './utils/resolve-vcr-scope';
import { validateVcrChoice } from './utils/validators';
import { emitVcrArgParseError, reportEnginePushFailure } from './utils/errors';
import {
  VCR_ENGINES,
  isEngineInstalled,
  pushCompressionArgs,
  resolveRegistry,
  runEngine,
  splitPassthrough,
  type VcrEngine,
} from './utils/engine';
import {
  DEFAULT_TAG,
  buildRepositoryReference,
  parseNameArg,
  validateImageParts,
} from './utils/image-ref';

export default async function push(
  client: Client,
  telemetry: VcrTelemetryClient
): Promise<number> {
  const { own, passthrough } = splitPassthrough(client.argv);

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      own,
      getFlagsSpecification(pushSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(client, err, 'vcr push <engine> [name[:tag]]');
    printError(err);
    return 1;
  }

  // Positionals are `vcr push <engine> [name]`; drop the first two.
  const [engineArg, nameArg] = parsedArgs.args.slice(2) as Array<
    string | undefined
  >;
  const project = parsedArgs.flags['--project'] as string | undefined;

  telemetry.trackCliArgumentEngine(engineArg);
  telemetry.trackCliArgumentName(nameArg);
  telemetry.trackCliOptionProject(project);

  if (!engineArg) {
    const message = `Missing engine. Choose one of: ${VCR_ENGINES.join(', ')}.`;
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'vcr push docker'
            ),
            when: 'Replace docker with the container tool you use',
          },
        ],
      },
      1
    );
    return outputError(client, false, 'MISSING_ARGUMENTS', message);
  }

  const choiceError = validateVcrChoice(
    client,
    'engine',
    engineArg,
    VCR_ENGINES,
    false
  );
  if (typeof choiceError === 'number') {
    return choiceError;
  }
  const engine = engineArg as VcrEngine;

  if (!isEngineInstalled(engine)) {
    const message = `\`${engine}\` is not installed or not on your PATH. Install it and try again.`;
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'engine_not_found',
        message,
      },
      1
    );
    return outputError(client, false, 'ENGINE_NOT_FOUND', message);
  }

  const scope = await resolveVcrScope(client, { project, jsonOutput: false });
  if (typeof scope === 'number') {
    return scope;
  }

  const parsed = parseNameArg(nameArg, scope.projectName);
  if ('error' in parsed) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: parsed.error,
      },
      1
    );
    return outputError(client, false, 'INVALID_ARGUMENTS', parsed.error);
  }

  const validationError = validateImageParts(parsed);
  if (validationError) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: validationError,
      },
      1
    );
    return outputError(client, false, 'INVALID_ARGUMENTS', validationError);
  }

  const base = buildRepositoryReference({
    registry: resolveRegistry(),
    teamSlug: scope.teamSlug,
    projectName: scope.projectName,
    repository: parsed.repository,
  });
  const ref = `${base}:${parsed.tag ?? DEFAULT_TAG}`;

  const engineArgs = [
    'push',
    ...pushCompressionArgs(engine),
    ...passthrough,
    ref,
  ];

  output.log(`Running: ${engine} ${engineArgs.join(' ')}`);

  const result = await runEngine(engine, engineArgs, {
    cwd: client.cwd,
    captureStderr: true,
  });
  if (result.exitCode !== 0) {
    return reportEnginePushFailure(client, engine, 'push', result);
  }

  output.success(`Pushed ${ref}`);
  return 0;
}
