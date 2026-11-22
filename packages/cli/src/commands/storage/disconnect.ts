import chalk from 'chalk';
import output from '../../output-manager';
import {
  buildCommandWithGlobalFlags,
  outputActionRequired,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';
import { canPrompt } from '../../util/can-prompt';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { validateJsonOutput } from '../../util/output-format';
import { getCommandNamePlain } from '../../util/pkg-name';
import {
  disconnectAllStoreConnections,
  disconnectStoreConnection,
} from '../../util/storage/connections';
import { planDisconnectEnvVars } from '../../util/storage/env-vars';
import { buildStoragePlan } from '../../util/storage/plan';
import {
  getConnections,
  resolveProjectConnection,
  type StorageConnection,
} from '../../util/storage/store';
import { StorageDisconnectTelemetryClient } from '../../util/telemetry/commands/storage/disconnect';
import { disconnectSubcommand } from './command';
import { writeStorageResult } from './result';
import {
  failWith,
  printStoragePlan,
  resolveStorageScope,
  resolveStorageStore,
} from './shared';
import getScope from '../../util/get-scope';

export async function disconnect(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new StorageDisconnectTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const flagsSpecification = getFlagsSpecification(
    disconnectSubcommand.options
  );
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
  const all = flags['--all'] ?? false;

  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliFlagDryRun(dryRun);
  telemetry.trackCliFlagAll(all);
  telemetry.trackCliOptionProject(flags['--project']);
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
        'Too many arguments. Usage: `vercel storage disconnect <store> [--project <name-or-id>]`.',
    });
  }

  if (all && flags['--project']) {
    return failWith(client, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: '--all and --project cannot be combined.',
    });
  }

  if (asJson && !dryRun) {
    output.error(
      '--json requires --dry-run. Disconnecting removes environment variables from the project, so applying it always requires interactive confirmation.'
    );
    return 2;
  }

  // Disconnecting deletes the connection's environment variables from the
  // project, so it always requires interactive confirmation and cannot be
  // scripted or run by agents. `--dry-run` stays available everywhere.
  if (!dryRun && !canPrompt(client)) {
    const commandTail = [
      `storage disconnect ${args[0]}`,
      all ? '--all' : undefined,
      flags['--project'] ? `--project ${flags['--project']}` : undefined,
    ]
      .filter(Boolean)
      .join(' ');
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.INTERACTIVE_CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message:
          'Disconnecting a storage resource removes its environment variables from the project and requires interactive confirmation. ' +
          'Agents must not make this change on behalf of a user.',
        userActionRequired: true,
        hint: 'A human must run the first command in next[] in an interactive terminal. Agents may only run the --dry-run preview.',
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, commandTail),
            when: 'Review the change set and confirm in a terminal',
          },
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `${commandTail} --dry-run --json`
            ),
            when: 'Preview the environment variables that would be removed',
          },
        ],
      },
      1
    );
    output.error(
      'Confirmation required. Disconnecting removes environment variables from the project and must be confirmed in an interactive terminal.'
    );
    return 1;
  }

  let accountId: string | undefined;
  let project: { id: string; name: string } | undefined;

  if (all) {
    // `--all` is not project-scoped, so it reads the store from the current
    // team or personal scope instead of a linked project.
    const { team } = await getScope(client);
    client.config.currentTeam = team?.id;
    accountId = team?.id;
  } else {
    const scope = await resolveStorageScope(client, flags['--project']);
    if (typeof scope === 'number') {
      return scope;
    }
    accountId = scope.accountId;
    project = scope.project;
  }

  const store = await resolveStorageStore(client, args[0], accountId);
  if (typeof store === 'number') {
    return store;
  }

  let connections: StorageConnection[];
  if (all) {
    connections = getConnections(store);
    if (connections.length === 0) {
      return failWith(client, {
        reason: AGENT_REASON.NOT_FOUND,
        message: `${store.name} is not connected to any project.`,
      });
    }
  } else {
    const target = resolveProjectConnection(store, project!.id);
    if (target.status === 'not_found') {
      return failWith(client, {
        reason: AGENT_REASON.NOT_FOUND,
        message: `${store.name} is not connected to ${project!.name}.`,
        next: [
          {
            command: getCommandNamePlain(`storage status ${store.name}`),
            when: 'see which projects are connected',
          },
        ],
      });
    }
    connections =
      target.status === 'found' ? [target.connection] : target.connections;
  }

  const plan = buildStoragePlan({
    action: 'disconnect',
    dryRun,
    store,
    projects: connections.map(connection => ({
      id: connection.projectId,
      name: connection.name,
    })),
    environments: [
      ...new Set(connections.flatMap(connection => connection.environments)),
    ],
    envVars: planDisconnectEnvVars(connections),
  });

  if (dryRun) {
    writeStorageResult(client, plan, { applied: false, asJson });
    return 0;
  }

  printStoragePlan(client, plan, false);

  const removedCount = plan.envVars.remove.length;
  const targetName = all
    ? `${connections.length} ${connections.length === 1 ? 'project' : 'projects'}`
    : chalk.bold(connections[0]?.name ?? project!.name);
  const consequence =
    removedCount > 0
      ? ` This removes ${removedCount} environment ${removedCount === 1 ? 'variable' : 'variables'}.`
      : '';
  const confirmed = await client.input.confirm(
    `Disconnect ${chalk.bold(store.name)} from ${targetName}?${consequence}`,
    false
  );
  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  try {
    output.spinner('Disconnecting storage resource…', 500);
    if (all) {
      await disconnectAllStoreConnections(client, { store, accountId });
    } else {
      for (const connection of connections) {
        await disconnectStoreConnection(client, {
          store,
          connectionId: connection.id,
          accountId,
        });
      }
    }
  } catch (error) {
    output.stopSpinner();
    return failWith(client, {
      reason: AGENT_REASON.API_ERROR,
      message: `A problem occurred while disconnecting: ${(error as Error).message}`,
    });
  }
  output.stopSpinner();

  const targetLabel = all
    ? 'all projects'
    : chalk.bold(connections[0]?.name ?? project!.name);

  writeStorageResult(client, plan, {
    applied: true,
    asJson,
    message: `Disconnected ${chalk.bold(store.name)} from ${targetLabel}`,
  });

  return 0;
}
