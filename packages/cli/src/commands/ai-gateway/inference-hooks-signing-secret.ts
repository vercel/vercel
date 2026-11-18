import type Client from '../../util/client';
import { printError } from '../../util/error';
import { isArgumentError, takeCommand } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { AiGatewayInferenceHooksSigningSecretTelemetryClient } from '../../util/telemetry/commands/ai-gateway/inference-hooks';
import { getCommandAliases } from '..';
import { printUnknownCommand } from '../print-command-help';
import { inferenceHooksSigningSecretSubcommand } from './command';
import { GROUP, routingFlags, usageError } from './inference-hooks-shared';
import create from './inference-hooks-signing-secret-create';
import rotate from './inference-hooks-signing-secret-rotate';

const COMMAND_CONFIG = Object.fromEntries(
  inferenceHooksSigningSecretSubcommand.subcommands.map(command => [
    command.name,
    getCommandAliases(command),
  ])
);

/**
 * Routes `vercel ai-gateway inference-hooks signing-secret <subcommand>`.
 * `argv` is what follows `signing-secret`.
 */
export default async function signingSecret(
  client: Client,
  argv: string[]
): Promise<number> {
  let selected;
  try {
    selected = takeCommand(argv, routingFlags);
  } catch (err) {
    printError(err, client);
    return isArgumentError(err) ? 2 : 1;
  }

  const { subcommand, subcommandOriginal } = getSubcommand(
    selected.command ? [selected.command] : [],
    COMMAND_CONFIG
  );
  const telemetry = new AiGatewayInferenceHooksSigningSecretTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  switch (subcommand) {
    case 'create':
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      return create(client, selected.args);
    case 'rotate':
      telemetry.trackCliSubcommandRotate(subcommandOriginal);
      return rotate(client, selected.args);
    default:
      if (!selected.command) {
        return usageError(
          client,
          argv.includes('--json'),
          `${GROUP} signing-secret`,
          {
            reason: 'missing_command',
            message: `Can't run vercel ${GROUP} signing-secret without a subcommand.`,
          }
        );
      }
      printUnknownCommand(client, selected.command, [
        ...GROUP.split(' '),
        'signing-secret',
      ]);
      return 2;
  }
}
