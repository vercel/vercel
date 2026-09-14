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
import { buildSubcommand } from './command';
import { resolveVcrScope } from './utils/resolve-vcr-scope';
import { validateVcrChoice } from './utils/validators';
import {
  emitVcrArgParseError,
  reportEngineCommandFailure,
  reportEnginePushFailure,
} from './utils/errors';
import {
  VCR_ENGINES,
  isBuildxAvailable,
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

const DEFAULT_PLATFORM = 'linux/amd64';

export default async function build(
  client: Client,
  telemetry: VcrTelemetryClient
): Promise<number> {
  const { own, passthrough } = splitPassthrough(client.argv);

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      own,
      getFlagsSpecification(buildSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(client, err, 'vcr build <engine> [path] [name[:tag]]');
    printError(err);
    return 1;
  }

  // Positionals are `vcr build <engine> [path] [name]`; drop the first two.
  const [engineArg, pathArg, nameArg] = parsedArgs.args.slice(2) as Array<
    string | undefined
  >;
  const project = parsedArgs.flags['--project'] as string | undefined;
  const platform = parsedArgs.flags['--platform'] as string | undefined;
  const push = Boolean(parsedArgs.flags['--push']);

  telemetry.trackCliArgumentEngine(engineArg);
  telemetry.trackCliArgumentPath(pathArg);
  telemetry.trackCliArgumentName(nameArg);
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionPlatform(platform);
  telemetry.trackCliFlagPush(push);

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
              'vcr build docker'
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

  const contextPath = pathArg ?? '.';
  const buildPlatform = platform ?? DEFAULT_PLATFORM;

  // Docker can only produce a zstd-compressed image through the Buildx
  // `--output` exporter, which builds and pushes in a single step.
  if (push && engine === 'docker' && (await isBuildxAvailable())) {
    const outputSpec = `type=image,name=${ref},push=true,oci-mediatypes=true,compression=zstd,compression-level=3,force-compression=true`;
    const engineArgs = [
      'buildx',
      'build',
      '--platform',
      buildPlatform,
      '--output',
      outputSpec,
      ...passthrough,
      contextPath,
    ];

    output.log(`Running: ${engine} ${engineArgs.join(' ')}`);

    const result = await runEngine(engine, engineArgs, {
      cwd: client.cwd,
      captureStderr: true,
    });
    if (result.exitCode !== 0) {
      return reportEnginePushFailure(client, engine, 'buildx build', result);
    }

    output.success(`Built and pushed ${ref} (zstd compression)`);
    return 0;
  }

  if (push && engine === 'docker') {
    output.warn(
      'Docker Buildx is not available; building and pushing without zstd compression. Install Buildx for smaller, faster image pushes.'
    );
  }

  const engineArgs = [
    'build',
    '--platform',
    buildPlatform,
    '--tag',
    ref,
    ...passthrough,
    contextPath,
  ];

  output.log(`Running: ${engine} ${engineArgs.join(' ')}`);

  const result = await runEngine(engine, engineArgs, { cwd: client.cwd });
  if (result.exitCode !== 0) {
    return reportEngineCommandFailure(client, engine, 'build', result);
  }

  if (!push) {
    output.success(`Built ${ref}`);
    output.log(
      `Push it with \`${buildCommandWithGlobalFlags(
        client.argv,
        `vcr push ${engine}${nameArg ? ` ${nameArg}` : ''}`
      )}\`.`
    );
    return 0;
  }

  const pushArgs = ['push', ...pushCompressionArgs(engine), ref];

  output.log(`Running: ${engine} ${pushArgs.join(' ')}`);

  const pushResult = await runEngine(engine, pushArgs, {
    cwd: client.cwd,
    captureStderr: true,
  });
  if (pushResult.exitCode !== 0) {
    return reportEnginePushFailure(client, engine, 'push', pushResult);
  }

  const compressed = engine !== 'docker';
  output.success(
    `Built and pushed ${ref}${compressed ? ' (zstd compression)' : ''}`
  );
  return 0;
}
