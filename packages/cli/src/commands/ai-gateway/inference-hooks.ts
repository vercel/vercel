import type Client from '../../util/client';
import { printError } from '../../util/error';
import { isArgumentError, takeCommand } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { AiGatewayInferenceHooksTelemetryClient } from '../../util/telemetry/commands/ai-gateway/inference-hooks';
import { getCommandAliases } from '..';
import { printUnknownCommand } from '../print-command-help';
import { inferenceHooksSubcommand } from './command';
import disable from './inference-hooks-disable';
import enable from './inference-hooks-enable';
import remove from './inference-hooks-remove';
import set from './inference-hooks-set';
import {
  GROUP,
  handleUnexpectedError,
  routingFlags,
  usageError,
} from './inference-hooks-shared';
import signingSecret from './inference-hooks-signing-secret';
import status from './inference-hooks-status';
import test from './inference-hooks-test';

type Leaf = (client: Client, argv: string[]) => Promise<number>;

const RUN: Record<string, Leaf> = {
  status,
  set,
  enable,
  disable,
  remove,
  'signing-secret': signingSecret,
  test,
};

const COMMAND_CONFIG = Object.fromEntries(
  inferenceHooksSubcommand.subcommands.map(command => [
    command.name,
    getCommandAliases(command),
  ])
);

/**
 * Routes `vercel ai-gateway inference-hooks <subcommand>`. The CLI entry
 * point answers `--help`, and a bare group, from the command metadata.
 */
export default async function inferenceHooks(client: Client): Promise<number> {
  let selected;
  try {
    const root = takeCommand(client.argv.slice(2), routingFlags);
    const group = takeCommand(root.args, routingFlags);
    selected = takeCommand(group.args, routingFlags);
  } catch (err) {
    printError(err, client);
    return isArgumentError(err) ? 2 : 1;
  }

  const { subcommand, subcommandOriginal } = getSubcommand(
    selected.command ? [selected.command] : [],
    COMMAND_CONFIG
  );
  if (!selected.command) {
    return usageError(client, selected.args.includes('--json'), GROUP, {
      reason: 'missing_command',
      message: `Can't run vercel ${GROUP} without a subcommand.`,
    });
  }
  if (typeof subcommand !== 'string') {
    printUnknownCommand(client, selected.command, GROUP.split(' '));
    return 2;
  }

  const telemetry = new AiGatewayInferenceHooksTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const track: Record<string, (actual: string) => void> = {
    status: a => telemetry.trackCliSubcommandStatus(a),
    set: a => telemetry.trackCliSubcommandSet(a),
    enable: a => telemetry.trackCliSubcommandEnable(a),
    disable: a => telemetry.trackCliSubcommandDisable(a),
    remove: a => telemetry.trackCliSubcommandRemove(a),
    'signing-secret': a => telemetry.trackCliSubcommandSigningSecret(a),
    test: a => telemetry.trackCliSubcommandTest(a),
  };
  track[subcommand](subcommandOriginal);

  try {
    return await RUN[subcommand](client, selected.args);
  } catch (err) {
    return handleUnexpectedError(client, selected.args.includes('--json'), err);
  }
}
