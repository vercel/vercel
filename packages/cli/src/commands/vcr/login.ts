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
import { loginSubcommand } from './command';
import { resolveVcrScope } from './utils/resolve-vcr-scope';
import { validateVcrJsonOutput, validateVcrChoice } from './utils/validators';
import { emitVcrArgParseError, handleVcrApiError } from './utils/errors';
import {
  VCR_ENGINES,
  VCR_LOGIN_USERNAME,
  engineLogin,
  isEngineInstalled,
  resolveRegistry,
  type VcrEngine,
} from './utils/engine-login';

/** stderr signatures that mean the registry rejected our credentials. */
const AUTH_FAILURE = /denied|forbidden|unauthorized|401|403/i;

/**
 * The minted project OIDC token is development-scoped, which the API issues with
 * a 12-hour TTL (see `getProjectToken` in vercel/api). The engine stores that
 * token as a static credential, so the login is only good until it expires.
 */
const LOGIN_VALID_HOURS = 12;

/** Last few lines of engine stderr, for surfacing an unexpected failure. */
function stderrTail(stderr: string): string {
  return stderr.trim().split('\n').slice(-5).join('\n');
}

export default async function login(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(loginSubcommand.options)
    );
  } catch (err) {
    emitVcrArgParseError(
      client,
      err,
      'vcr login <engine> --project <name-or-id>'
    );
    printError(err);
    return 1;
  }

  const fr = validateVcrJsonOutput(client, parsedArgs.flags);
  if (typeof fr === 'number') {
    return fr;
  }

  const engineArg = parsedArgs.args[0] as string | undefined;
  const project = parsedArgs.flags['--project'] as string | undefined;

  telemetry.trackCliArgumentEngine(engineArg);
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  // The engine must always be specified explicitly — there is no default.
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
              'vcr login docker'
            ),
            when: 'Replace docker with the container tool you use',
          },
        ],
      },
      1
    );
    return outputError(client, fr.jsonOutput, 'MISSING_ARGUMENTS', message);
  }

  const choiceError = validateVcrChoice(
    client,
    'engine',
    engineArg,
    VCR_ENGINES,
    fr.jsonOutput
  );
  if (typeof choiceError === 'number') {
    return choiceError;
  }
  const engine = engineArg as VcrEngine;

  // Fail fast on a missing binary before doing any network work.
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
    return outputError(client, fr.jsonOutput, 'ENGINE_NOT_FOUND', message);
  }

  const scope = await resolveVcrScope(client, {
    project,
    jsonOutput: fr.jsonOutput,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const registry = resolveRegistry();

  output.spinner(`Authenticating ${engine} with ${registry}...`);
  try {
    // Mint a fresh project OIDC token (same endpoint as `vercel project token`).
    // The token is only ever piped to the engine over stdin — never logged,
    // returned to the caller, or placed on the command line.
    const { token } = await client.fetch<{ token: string }>(
      `/projects/${scope.projectId}/token`,
      {
        method: 'POST',
        accountId: scope.teamId,
        body: JSON.stringify({ source: 'vercel-cli' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const result = await engineLogin(engine, registry, token);
    if (result.exitCode !== 0) {
      const message = AUTH_FAILURE.test(result.stderr)
        ? `Authentication to ${registry} as "${VCR_LOGIN_USERNAME}" was rejected. The OIDC token may be expired or lack access to this project.`
        : `\`${engine} login\` failed (exit code ${result.exitCode}).${
            stderrTail(result.stderr) ? `\n${stderrTail(result.stderr)}` : ''
          }`;
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AUTH_FAILURE.test(result.stderr)
            ? 'not_authorized'
            : 'command_failed',
          message,
          next: [
            {
              command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
              when: 'See current user and team',
            },
          ],
        },
        1
      );
      return outputError(
        client,
        fr.jsonOutput,
        AUTH_FAILURE.test(result.stderr) ? 'NOT_AUTHORIZED' : 'COMMAND_FAILED',
        message
      );
    }

    if (fr.jsonOutput) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: 'success',
            engine,
            registry,
            username: VCR_LOGIN_USERNAME,
            validForHours: LOGIN_VALID_HOURS,
          },
          null,
          2
        )}\n`
      );
    } else {
      output.success(
        `Logged in to ${registry} as ${VCR_LOGIN_USERNAME} (${engine}).`
      );
      output.log(
        `Credentials are valid for ~${LOGIN_VALID_HOURS} hours. Re-run \`${buildCommandWithGlobalFlags(
          client.argv,
          `vcr login ${engine}`
        )}\` to refresh.`
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
