import { loadEnvConfig } from '@next/env';
import chalk from 'chalk';
import execa from 'execa';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { runSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { resolveProjectContext } from '../../util/projects/resolve-project-context';
import getEnvRecords, { pullEnvRecords } from '../../util/env/get-env-records';
import parseTarget from '../../util/parse-target';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { outputActionRequired } from '../../util/agent-output';
import type { EnvTelemetryClient } from '../../util/telemetry/commands/env';
import { SENSITIVE_ENV_VALUE_PLACEHOLDER } from '../../util/env/constants';
import { isSecretEnvVar } from '../../util/env/env-var-config-secret-ui';
import {
  getLocalSecretFallbackMessage,
  getUnavailableSecretValuesMessage,
} from '../../util/env/secret-read-guidance';

function printEnvRunWarning(message: string): void {
  output.print(`${chalk.yellow('!')} ${message}\n`);
}

export function omitUnavailableSecretPlaceholders(
  localEnv: Record<string, string | undefined>,
  secretKeys: Iterable<string>
): Record<string, string | undefined> {
  const safeLocalEnv = { ...localEnv };
  for (const key of secretKeys) {
    if (safeLocalEnv[key] === SENSITIVE_ENV_VALUE_PLACEHOLDER) {
      delete safeLocalEnv[key];
    }
  }
  return safeLocalEnv;
}

/**
 * Parses argv for the run subcommand, splitting on `--` to separate
 * vercel flags from the user's command.
 */
function parseRunArgs(argv: string[]) {
  const argvIndex = argv.indexOf('--');
  const hasDoubleDash = argvIndex !== -1;

  // Everything before '--' are the vercel env run flags
  const vercelArgs = hasDoubleDash ? argv.slice(2, argvIndex) : argv.slice(2);

  // Everything after '--' is the user's command
  const userCommand = hasDoubleDash ? argv.slice(argvIndex + 1) : [];

  return { vercelArgs, userCommand };
}

/**
 * Checks if --help was passed in the vercel args (before `--`).
 * Used by the parent to handle help consistently with other subcommands.
 */
export function needsHelpForRun(client: Client): boolean {
  const { vercelArgs } = parseRunArgs(client.argv);
  const flagsSpecification = getFlagsSpecification(runSubcommand.options);

  try {
    const parsedArgs = parseArguments(vercelArgs, flagsSpecification);
    return Boolean(parsedArgs.flags['--help']);
  } catch {
    return false;
  }
}

export default async function run(
  client: Client,
  telemetry: EnvTelemetryClient
): Promise<number> {
  const { vercelArgs, userCommand } = parseRunArgs(client.argv);

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(runSubcommand.options);

  try {
    parsedArgs = parseArguments(vercelArgs, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (userCommand.length === 0) {
    outputActionRequired(
      client,
      {
        status: 'action_required',
        reason: 'missing_command',
        message:
          'No command provided. Use `--` to separate Vercel flags from your command.',
        next: [{ command: getCommandNamePlain('env run -- <command>') }],
      },
      1
    );
    output.error(
      `No command provided. Use \`--\` to separate vercel flags from your command.`
    );
    return 1;
  }

  // Resolve the selected project
  const projectName = parsedArgs.flags['--project'];
  telemetry.trackCliOptionProject(projectName);

  const link = await resolveProjectContext({
    client,
    projectNameOrId: projectName,
  });
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    outputActionRequired(
      client,
      {
        status: 'action_required',
        reason: 'not_linked',
        message:
          "Your codebase isn't linked to a project on Vercel. Run `vercel link`, then retry this command.",
        next: [{ command: getCommandNamePlain('link') }],
      },
      1
    );
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName(
        'link'
      )} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const environment =
    parseTarget({
      flagName: 'environment',
      flags: parsedArgs.flags,
    }) || 'development';

  const gitBranch = parsedArgs.flags['--git-branch'];

  output.spinner(`Downloading \`${environment}\` environment variables`);

  const records = await pullEnvRecords(
    client,
    link.project.id,
    'vercel-cli:env:run',
    {
      target: environment,
      gitBranch,
    }
  );

  output.stopSpinner();

  output.debug(
    `Running command with ${Object.keys(records.env).length} environment variables`
  );

  let localEnv: Record<string, string | undefined> = {};
  try {
    localEnv = loadEnvConfig(client.cwd, true).combinedEnv;
  } catch (err) {
    output.debug(`Failed to load local env files: ${err}`);
  }

  const localPlaceholderKeys = Object.entries(localEnv)
    .filter(([, value]) => value === SENSITIVE_ENV_VALUE_PLACEHOLDER)
    .map(([key]) => key);
  const safeLocalEnv = omitUnavailableSecretPlaceholders(
    localEnv,
    localPlaceholderKeys
  );
  const processPlaceholderKeys = Object.keys(records.env).filter(
    key => process.env[key] === SENSITIVE_ENV_VALUE_PLACEHOLDER
  );
  const safeProcessEnv = omitUnavailableSecretPlaceholders(
    process.env,
    processPlaceholderKeys
  );
  const unavailableCandidateKeys = new Set(
    Object.entries(records.env)
      .filter(
        ([key, value]) => !value && !safeLocalEnv[key] && !safeProcessEnv[key]
      )
      .map(([key]) => key)
  );
  if (unavailableCandidateKeys.size > 0) {
    try {
      const { envs } = await getEnvRecords(
        client,
        link.project.id,
        'vercel-cli:env:run',
        { target: environment, gitBranch }
      );
      const unavailableSecretKeys = envs.filter(
        env => isSecretEnvVar(env) && unavailableCandidateKeys.has(env.key)
      );
      if (unavailableSecretKeys.length > 0) {
        printEnvRunWarning(
          `${getUnavailableSecretValuesMessage(
            environment,
            unavailableSecretKeys.length
          )}${getLocalSecretFallbackMessage(unavailableSecretKeys.length)}`
        );
      }
    } catch {
      // The command can still run with the values returned by the pull API.
    }
  }

  try {
    const result = await execa(userCommand[0], userCommand.slice(1), {
      cwd: client.cwd,
      stdio: 'inherit',
      reject: false,
      env: {
        ...records.env,
        ...safeLocalEnv,
        ...safeProcessEnv,
      },
    });

    if (result instanceof Error && typeof result.exitCode !== 'number') {
      // Command does not exist or is not executable
      output.prettyError(result);
      return 1;
    }

    return result.exitCode;
  } catch (err: unknown) {
    output.prettyError(err);
    return 1;
  }
}
