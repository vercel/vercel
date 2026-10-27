import chalk from 'chalk';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { validateJsonOutput } from '../../util/output-format';
import { getCommandNamePlain } from '../../util/pkg-name';
import {
  inferConnectionAuth,
  parseAuthMode,
  resolveStorageAuth,
  type StorageAuthMode,
} from '../../util/storage/auth';
import {
  updateStoreConnection,
  upgradeStoreConnectionToOidc,
} from '../../util/storage/connections';
import {
  diffEnvVarNames,
  normalizeEnvVarPrefix,
  planUpdateEnvVars,
} from '../../util/storage/env-vars';
import { buildStoragePlan } from '../../util/storage/plan';
import {
  resolveProjectConnection,
  storeSupportsOidc,
} from '../../util/storage/store';
import { StorageUpdateTelemetryClient } from '../../util/telemetry/commands/storage/update';
import { updateSubcommand } from './command';
import {
  getStorageEnvPullNext,
  readBackConnectionEnvVars,
  writeStorageResult,
} from './result';
import {
  confirmStorageChange,
  failWith,
  printStoragePlan,
  resolveEnvironments,
  resolvePrefix,
  resolveStorageScope,
  resolveStorageStore,
} from './shared';

function sameEnvironments(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const left = new Set(a);
  return b.every(value => left.has(value));
}

export async function update(client: Client, argv: string[]): Promise<number> {
  const telemetry = new StorageUpdateTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const flagsSpecification = getFlagsSpecification(updateSubcommand.options);
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
  const addRwTokenFlag = flags['--add-rw-token'] ?? false;

  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliFlagYes(skipConfirmation);
  telemetry.trackCliFlagDryRun(dryRun);
  telemetry.trackCliFlagAddRwToken(addRwTokenFlag);
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
        'Too many arguments. Usage: `vercel storage update <store> [--project <name-or-id>]`.',
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

  const environmentsFlag = resolveEnvironments(flags['--environment']);
  if (!environmentsFlag.valid) {
    return failWith(client, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: environmentsFlag.message,
    });
  }

  const prefixFlag = resolvePrefix(flags['--prefix']);
  if (!prefixFlag.valid) {
    return failWith(client, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: prefixFlag.message,
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

  const target = resolveProjectConnection(
    store,
    scope.project.id,
    environmentsFlag.explicit ? environmentsFlag.environments : undefined
  );

  if (target.status === 'not_found') {
    return failWith(client, {
      reason: AGENT_REASON.NOT_FOUND,
      message: `${store.name} is not connected to ${scope.project.name}.`,
      next: [
        {
          command: getCommandNamePlain(`storage connect ${store.name}`),
          when: 'create the connection',
        },
      ],
    });
  }

  if (target.status === 'ambiguous') {
    return failWith(client, {
      reason: 'ambiguous_connection',
      message: `${scope.project.name} has more than one connection to ${store.name} (${target.connections
        .map(connection => connection.environments.join('+'))
        .join(', ')}). Pass --environment to pick one.`,
    });
  }

  const connection = target.connection;
  const currentEnvVars = connection.environmentVariables ?? [];
  const currentAuth = inferConnectionAuth(
    store,
    connection.environmentVariables
  );
  const hasOidcVars = currentEnvVars.some(name => name.endsWith('_STORE_ID'));
  const hasRwTokenNow = currentEnvVars.some(name =>
    name.endsWith('_READ_WRITE_TOKEN')
  );

  // `--auth` defaults to the connection's current mode on update, so an
  // unrelated change (environments, prefix) never rotates credentials.
  const requestedMode: StorageAuthMode = authMode.explicit
    ? authMode.mode
    : currentAuth === 'token'
      ? 'token'
      : 'oidc';
  const addRwToken = addRwTokenFlag || (!authMode.explicit && hasRwTokenNow);

  const auth = resolveStorageAuth({
    store,
    mode: requestedMode,
    addRwToken,
  });
  if (!auth.valid) {
    return failWith(client, {
      reason: auth.reason,
      message: auth.error,
      hint: auth.hint,
    });
  }

  const environments = environmentsFlag.explicit
    ? environmentsFlag.environments
    : connection.environments;
  const currentPrefix = normalizeEnvVarPrefix(connection.envVarPrefix);
  const prefix =
    prefixFlag.prefix !== undefined ? prefixFlag.prefix : currentPrefix;

  const environmentsChanged =
    environmentsFlag.explicit &&
    !sameEnvironments(environments, connection.environments);
  const prefixChanged =
    flags['--prefix'] !== undefined && prefix !== currentPrefix;
  const needsOidcUpgrade =
    storeSupportsOidc(store) && auth.auth.effective === 'oidc' && !hasOidcVars;
  const rwTokenChanged =
    storeSupportsOidc(store) && auth.auth.readWriteToken !== hasRwTokenNow;

  if (
    !environmentsChanged &&
    !prefixChanged &&
    !needsOidcUpgrade &&
    !rwTokenChanged
  ) {
    return failWith(client, {
      reason: AGENT_REASON.NO_CHANGES_REQUESTED,
      message: `Nothing to update: ${store.name} on ${scope.project.name} already matches the requested configuration.`,
      next: [
        {
          command: getCommandNamePlain(`storage status ${store.name}`),
          when: 'inspect the current connection',
        },
      ],
    });
  }

  const plan = buildStoragePlan({
    action: 'update',
    dryRun,
    store,
    projects: [scope.project],
    environments,
    envVarPrefix: prefix,
    auth: auth.auth,
    envVars: planUpdateEnvVars({
      store,
      auth: auth.auth,
      prefix,
      connection,
      prefixChanged,
    }),
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
    output.spinner('Updating storage connection…', 500);

    if (needsOidcUpgrade) {
      await upgradeStoreConnectionToOidc(client, {
        store,
        connectionId: connection.id,
        auth: auth.auth,
        accountId: scope.accountId,
      });
    }

    const patchEnvironments = environmentsChanged ? environments : undefined;
    const patchPrefix = prefixChanged ? (prefix ?? null) : undefined;
    // Always state the target for Blob stores: the OIDC upgrade above is
    // additive and preserves the static token, so dropping it has to be
    // explicit.
    const patchSkipReadWriteToken = storeSupportsOidc(store)
      ? !auth.auth.readWriteToken
      : undefined;

    if (
      patchEnvironments !== undefined ||
      patchPrefix !== undefined ||
      patchSkipReadWriteToken !== undefined
    ) {
      await updateStoreConnection(client, {
        store,
        connectionId: connection.id,
        accountId: scope.accountId,
        environments: patchEnvironments,
        envVarPrefix: patchPrefix,
        skipReadWriteToken: patchSkipReadWriteToken,
      });
    }
  } catch (error) {
    output.stopSpinner();
    return failWith(client, {
      reason: AGENT_REASON.API_ERROR,
      message: `A problem occurred while updating the connection: ${(error as Error).message}`,
    });
  }
  output.stopSpinner();

  const verified = await readBackConnectionEnvVars(client, {
    store,
    projectId: scope.project.id,
    environments,
    accountId: scope.accountId,
  });

  const appliedPlan = verified
    ? buildStoragePlan({
        action: 'update',
        dryRun: false,
        store,
        projects: [scope.project],
        environments,
        envVarPrefix: prefix,
        auth: auth.auth,
        envVars: diffEnvVarNames(currentEnvVars, verified),
      })
    : plan;

  writeStorageResult(client, appliedPlan, {
    applied: true,
    asJson,
    message: `Updated ${chalk.bold(store.name)} on ${chalk.bold(scope.project.name)} (${environments.join(', ')})`,
    next: getStorageEnvPullNext(client, scope, [
      ...connection.environments,
      ...environments,
    ]),
  });

  return 0;
}
