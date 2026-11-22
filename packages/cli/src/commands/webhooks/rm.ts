import chalk from 'chalk';
import type Client from '../../util/client';
import deleteWebhook from '../../util/webhooks/delete-webhook';
import getWebhook from '../../util/webhooks/get-webhook';
import { getContextName } from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { buildCommandWithYes, outputAgentError } from '../../util/agent-output';
import output from '../../output-manager';
import { WebhooksRmTelemetryClient } from '../../util/telemetry/commands/webhooks/rm';
import { removeSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';

/** Build a plain suggested command with global flags (e.g. --cwd, --non-interactive) appended. */
function webhookCommandWithGlobalFlags(
  baseSubcommand: string,
  argv: string[]
): string {
  const globalFlags = getGlobalFlagsFromArgs(argv.slice(2));
  const full = globalFlags.length
    ? `${baseSubcommand} ${globalFlags.join(' ')}`
    : baseSubcommand;
  return getCommandNamePlain(full);
}

export default async function rm(client: Client, argv: string[]) {
  const telemetry = new WebhooksRmTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { args, flags: opts } = parsedArgs;
  const [webhookId] = args;

  telemetry.trackCliArgumentId(webhookId);
  telemetry.trackCliFlagYes(opts['--yes']);

  if (!webhookId) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_id',
          message: 'Webhook ID is required. Provide ID as the first argument.',
          next: [
            {
              command: webhookCommandWithGlobalFlags(
                'webhooks ls',
                client.argv
              ),
            },
            {
              command: webhookCommandWithGlobalFlags(
                'webhooks delete <id> --yes',
                client.argv
              ),
            },
          ],
        },
        2
      );
    }
    output.error(
      `${getCommandName(`webhooks delete <id>`)} expects one argument`
    );
    return 2;
  }

  const skipConfirmation = opts['--yes'] || false;
  if (client.nonInteractive && !skipConfirmation) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'confirmation_required',
        message: 'Deleting a webhook requires confirmation. Re-run with --yes.',
        next: [{ command: buildCommandWithYes(client.argv) }],
      },
      1
    );
  }

  const contextName = await getContextName(client);

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('webhooks delete <id>')}`
      )}`
    );
    return 2;
  }

  // Verify the webhook exists before asking for confirmation
  if (!client.nonInteractive) {
    output.spinner(`Fetching webhook ${webhookId}`);
  }
  let webhook;
  try {
    webhook = await getWebhook(client, webhookId);
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err) && err.status === 404) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'webhook_not_found',
            message: `Webhook not found: ${webhookId}.`,
            next: [
              {
                command: webhookCommandWithGlobalFlags(
                  'webhooks ls',
                  client.argv
                ),
              },
            ],
          },
          1
        );
      }
      output.error(`Webhook not found: ${webhookId}`);
      output.log(`Run ${getCommandName(`webhooks ls`)} to see your webhooks.`);
      return 1;
    }
    throw err;
  }

  output.stopSpinner();

  if (
    !skipConfirmation &&
    !(await client.input.confirm(
      `Are you sure you want to delete webhook ${param(webhookId)} (${webhook.url})?`,
      false
    ))
  ) {
    if (!client.nonInteractive) output.log('Canceled');
    return 0;
  }

  const removeStamp = stamp();
  if (!client.nonInteractive) {
    output.spinner(`Deleting webhook under ${chalk.bold(contextName)}`);
  }

  try {
    await deleteWebhook(client, webhookId);
    output.stopSpinner();
    if (client.nonInteractive) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: 'ok',
            webhook: { id: webhookId, url: webhook.url },
            message: `Webhook ${webhookId} deleted.`,
          },
          null,
          2
        )}\n`
      );
      return 0;
    }
    output.success(`Webhook ${chalk.bold(webhookId)} deleted ${removeStamp()}`);
    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err) && err.status === 404) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'webhook_not_found',
            message: `Webhook not found: ${webhookId}.`,
            next: [
              {
                command: webhookCommandWithGlobalFlags(
                  'webhooks ls',
                  client.argv
                ),
              },
            ],
          },
          1
        );
      }
      output.error(`Webhook not found: ${webhookId}`);
      return 1;
    }
    throw err;
  }
}
