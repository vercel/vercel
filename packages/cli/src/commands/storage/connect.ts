import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { buildCommandWithGlobalFlags } from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { validateJsonOutput } from '../../util/output-format';
import { parseAuthMode, resolveStorageAuth } from '../../util/storage/auth';
import { connectStoreToProject } from '../../util/storage/connections';
import {
  diffEnvVarNames,
  planConnectEnvVars,
} from '../../util/storage/env-vars';
import { buildStoragePlan } from '../../util/storage/plan';
import {
  findOverlappingConnections,
  getConnections,
} from '../../util/storage/store';
import { StorageConnectTelemetryClient } from '../../util/telemetry/commands/storage/connect';
import { connectSubcommand } from './command';
import {
  confirmStorageChange,
  failWith,
  printStoragePlan,
  resolveEnvironments,
  resolvePrefix,
  resolveStorageScope,
  resolveStorageStore,
} from './shared';
import {
  getStorageEnvPullNext,
  readBackConnectionEnvVars,
  writeStorageResult,
} from './result';

export async function connect(client: Client, argv: string[]): Promise<number> {
  const telemetry = new StorageConnectTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const flagsSpecification = getFlagsSpecification(connectSubcommand.options);
  let parsedArguments;
  try {
    parsedArguments = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }

  const { args, flags } = parsedArguments;

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;
  const dryRun = flags['--dry-run'] ?? false;
  const skipConfirmation = flags['--yes'] ?? false;
  const addRwToken = flags['--add-rw-token'] ?? false;

  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliFlagYes(skipConfirmation);
  telemetry.trackCliFlagDryRun(dryRun);
  telemetry.trackCliFlagAddRwToken(addRwToken);
  telemetry.trackCliOptionAuth(flags['--auth']);
  telemetry.trackCliOptionPrefix(flags['--prefix']);
  telemetry.trackCliOptionProject(flags['--project']);
  telemetry.trackCliOptionEnvironment(flags['--environment']);
  telemetry.trackCliArgumentStore(args[0]);

  if (args.length < 1) {
    return failWith(client, {
      reason: AGENT_REASON.MISSING_ARGUMENTS,
      message: 'You must specify a storage resource. See `--help` for details.',
    });
  }

  if (args.length > 1) {
    return failWith(client, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message:
        'Too many arguments. Usage: `vercel storage connect <store> [--project <name-or-id>]`.',
    });
  }

  if (asJson && !skipConfirmation && !dryRun) {
    output.error(
      '--json requires --yes or --dry-run to skip confirmation prompts'
    );
    return 2;
  }

  const authMode = parseAuthMode(flags['--auth']);
  if (!authMode.valid) {
    return failWith(client, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: authMode.error,
    });
  }

  const environments = resolveEnvironments(flags['--environment']);
  if (!environments.valid) {
    return failWith(client, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: environments.message,
    });
  }

  const prefix = resolvePrefix(flags['--prefix']);
  if (!prefix.valid) {
    return failWith(client, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: prefix.message,
    });
  }

  const scope = await resolveStorageScope(client, flags['--project']);
  if (typeof scope === 'number') {
    return scope;
  }

  const store = await resolveStorageStore(client, args[0], scope.accountId);
  if (typeof store === 'number') {
    return store;
  }

  const auth = resolveStorageAuth({
    store,
    mode: authMode.mode,
    addRwToken,
  });
  if (!auth.valid) {
    return failWith(client, {
      reason: auth.reason,
      message: auth.error,
      hint: auth.hint,
    });
  }

  const overlapping = findOverlappingConnections(
    store,
    scope.project.id,
    environments.environments
  );
  if (overlapping.length > 0) {
    return failWith(client, {
      reason: 'already_connected',
      message: `${store.name} is already connected to ${scope.project.name} in ${overlapping
        .flatMap(connection => connection.environments)
        .join(', ')}.`,
      hint: `Change the connection with ${getCommandName(`storage update ${store.name}`)}, or remove it with ${getCommandName(`storage disconnect ${store.name}`)}.`,
      next: [
        {
          command: getCommandNamePlain(`storage update ${store.name}`),
          when: 'change environments, prefix, or credential mode',
        },
        {
          command: getCommandNamePlain(`storage disconnect ${store.name}`),
          when: 'remove the existing connection first',
        },
      ],
    });
  }

  const envVars = planConnectEnvVars({
    store,
    auth: auth.auth,
    prefix: prefix.prefix,
    sibling: getConnections(store)[0],
  });

  const plan = buildStoragePlan({
    action: 'connect',
    dryRun,
    store,
    projects: [scope.project],
    environments: environments.environments,
    envVarPrefix: prefix.prefix,
    auth: auth.auth,
    envVars,
  });

  if (dryRun) {
    writeStorageResult(client, plan, { applied: false, asJson });
    return 0;
  }

  if (!asJson) {
    printStoragePlan(client, plan, false);
  }

  const confirmed = await confirmStorageChange(client, {
    skipConfirmation,
    question: 'Apply this change?',
  });
  if (typeof confirmed === 'number') {
    return confirmed;
  }
  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  try {
    output.spinner('Connecting storage resource…', 500);
    await connectStoreToProject(client, {
      store,
      projectId: scope.project.id,
      environments: environments.environments,
      envVarPrefix: prefix.prefix,
      auth: auth.auth,
      accountId: scope.accountId,
    });
  } catch (error) {
    output.stopSpinner();
    return reportConnectFailure(client, error, {
      storeName: store.name,
      projectName: scope.project.name,
      teamSlug: scope.teamSlug,
      environments: environments.environments,
      prefix: prefix.prefix,
    });
  }
  output.stopSpinner();

  const verified = await readBackConnectionEnvVars(client, {
    store,
    projectId: scope.project.id,
    environments: environments.environments,
    accountId: scope.accountId,
  });

  const appliedPlan = verified
    ? buildStoragePlan({
        action: 'connect',
        dryRun: false,
        store,
        projects: [scope.project],
        environments: environments.environments,
        envVarPrefix: prefix.prefix,
        auth: auth.auth,
        envVars: diffEnvVarNames([], verified),
      })
    : plan;

  writeStorageResult(client, appliedPlan, {
    applied: true,
    asJson,
    message: `Connected ${chalk.bold(store.name)} to ${chalk.bold(scope.project.name)} (${environments.environments.join(', ')})`,
    next: getStorageEnvPullNext(client, scope, environments.environments),
  });

  return 0;
}

/** Turns the API's env var collision error into actionable `--prefix` advice. */
function reportConnectFailure(
  client: Client,
  error: unknown,
  {
    storeName,
    projectName,
    teamSlug,
    environments,
    prefix,
  }: {
    storeName: string;
    projectName: string;
    teamSlug: string | undefined;
    environments: string[];
    prefix: string | undefined;
  }
): number {
  if (isAPIError(error) && error.status === 400) {
    const conflict = error.serverMessage?.match(
      /existing environment variable with name ([A-Za-z_][A-Za-z0-9_]*)/
    );
    if (conflict) {
      const varName = conflict[1];
      // Name the project and team explicitly: `env remove` would otherwise resolve
      // them from the local link, which may differ from the connect target.
      const envRmCmd = [
        'env remove',
        varName,
        environments.length === 1 ? environments[0] : undefined,
        `--project ${projectName}`,
        teamSlug ? `--scope ${teamSlug}` : undefined,
      ]
        .filter(Boolean)
        .join(' ');
      return failWith(client, {
        reason: 'env_var_conflict',
        message: `Cannot connect ${storeName}: env var ${varName} already exists on ${projectName} in one of the target environments (${environments.join(', ')}).`,
        hint:
          prefix === undefined
            ? `Re-run with \`--prefix <PREFIX>\` to namespace the new variables, or remove the existing one.`
            : `Prefix \`${prefix}\` did not avoid the collision. Try a different prefix or remove the existing variable.`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              envRmCmd,
              undefined,
              {
                // `--yes` consented to the connect, not to removing a variable.
                excludeFlags: ['--yes', '-y'],
              }
            ),
            when: `remove ${varName} from ${projectName}`,
          },
        ],
      });
    }
  }

  return failWith(client, {
    reason: AGENT_REASON.API_ERROR,
    message: `A problem occurred while connecting: ${(error as Error).message}`,
  });
}
