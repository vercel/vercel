import type Client from '../../util/client';
import { AGENT_STATUS } from '../../util/agent-output-constants';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import ms from 'ms';
import type { Schedule } from '../../util/schedules/types';
import { SchedulesActionTelemetryClient } from '../../util/telemetry/commands/schedules/action';
import output from '../../output-manager';
import {
  disableSubcommand,
  enableSubcommand,
  invokeSubcommand,
} from './command';
import { handleSchedulesApiError } from './errors';
import {
  invalidScheduleArguments,
  parseScheduleOutput,
  resolveSchedulesClient,
  scheduleTrackArgs,
  validateLocalScheduleFlags,
  validateScheduleNameAndNamespace,
  writeScheduleMutationResult,
} from './shared';
import { parseEnableUntil } from './validation';

type ScheduleAction = 'enable' | 'disable' | 'invoke';

export default async function runScheduleAction(
  client: Client,
  argv: string[],
  action: ScheduleAction
): Promise<number> {
  const subcommand =
    action === 'enable'
      ? enableSubcommand
      : action === 'disable'
        ? disableSubcommand
        : invokeSubcommand;
  const usage = `schedules ${action} <name>`;
  const telemetry = new SchedulesActionTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(subcommand.options)
    );
  } catch (error) {
    return invalidScheduleArguments(
      client,
      usage,
      error instanceof Error ? error.message : String(error)
    );
  }

  const { args, flags } = parsedArgs;
  const enableFlags = flags as { '--until'?: string; '--for'?: string };
  telemetry.trackCliFlagLocal(flags['--local']);
  const conflict = validateLocalScheduleFlags(client, flags, usage);
  if (conflict !== undefined) return conflict;
  telemetry.trackCliArgumentName(args[0]);
  telemetry.trackCliOptionNamespace(flags['--namespace']);
  telemetry.trackCliOptionEnvironment(flags['--environment']);
  telemetry.trackCliOptionGitBranch(flags['--git-branch']);
  telemetry.trackCliOptionUntil(enableFlags['--until']);
  telemetry.trackCliOptionFor(enableFlags['--for']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  const identifier = validateScheduleNameAndNamespace(
    client,
    args,
    flags['--namespace'],
    usage
  );
  if (!identifier.valid) return identifier.exitCode;
  const outputMode = parseScheduleOutput(client, usage, flags);
  if (!outputMode.valid) return outputMode.exitCode;
  const activeUntil = parseEnableUntil(
    enableFlags['--until'],
    enableFlags['--for']
  );
  if (!activeUntil.valid) {
    return invalidScheduleArguments(client, usage, activeUntil.error);
  }

  const schedulesClient = await resolveSchedulesClient(client, flags);
  if (typeof schedulesClient === 'number') return schedulesClient;

  const presentParticiple =
    action === 'enable'
      ? 'Enabling'
      : action === 'disable'
        ? 'Disabling'
        : 'Invoking';
  if (!outputMode.json) output.spinner(`${presentParticiple} schedule…`);

  let schedule: Schedule | undefined;
  try {
    if (action === 'enable') {
      schedule = await schedulesClient.enable({
        ...identifier,
        activeUntil: activeUntil.value,
      });
    } else if (action === 'disable') {
      schedule = await schedulesClient.disable(identifier);
    } else {
      await schedulesClient.invoke(identifier);
    }
  } catch (error) {
    output.stopSpinner();
    return handleSchedulesApiError(client, error, {
      action,
      local: flags['--local'],
      name: identifier.name,
      namespace: identifier.namespace,
      trackArgs: scheduleTrackArgs(flags),
    });
  }
  output.stopSpinner();

  const pastTense =
    action === 'enable'
      ? 'Enabled'
      : action === 'disable'
        ? 'Disabled'
        : 'Invoked';
  const enabledUntil = schedule?.activeUntil ?? activeUntil.value;
  const message =
    action === 'enable' && enabledUntil !== undefined
      ? `${pastTense} schedule ${identifier.namespace}/${identifier.name} until ${new Date(enabledUntil).toISOString()} (in ${ms(Math.max(enabledUntil - Date.now(), 1000), { long: true })}).`
      : `${pastTense} schedule ${identifier.namespace}/${identifier.name}.`;
  if (schedule) {
    return writeScheduleMutationResult(
      client,
      schedule,
      message,
      outputMode.json
    );
  }
  if (outputMode.json) {
    const result = client.nonInteractive
      ? { status: AGENT_STATUS.OK, message }
      : {
          invoked: true,
          name: identifier.name,
          namespace: identifier.namespace,
        };
    client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    output.success(message);
  }
  return 0;
}
