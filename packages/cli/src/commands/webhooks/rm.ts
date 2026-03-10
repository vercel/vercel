import chalk from 'chalk';
import type Client from '../../util/client';
import deleteWebhook from '../../util/webhooks/delete-webhook';
import getWebhook from '../../util/webhooks/get-webhook';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';
import { getCommandName } from '../../util/pkg-name';
import { buildCommandWithYes, outputAgentError } from '../../util/agent-output';
import output from '../../output-manager';
import { WebhooksRmTelemetryClient } from '../../util/telemetry/commands/webhooks/rm';
import { removeSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';

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
    return 1;
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
            { command: getCommandName('webhooks ls') },
            { command: getCommandName('webhooks rm <id> --yes') },
          ],
        },
        1
      );
    }
    output.error(`${getCommandName(`webhooks rm <id>`)} expects one argument`);
    return 1;
  }

  const skipConfirmation = opts['--yes'] || false;
  if (client.nonInteractive && !skipConfirmation) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'confirmation_required',
        message: 'Removing a webhook requires confirmation. Re-run with --yes.',
        next: [{ command: buildCommandWithYes(client.argv) }],
      },
      1
    );
  }

  const { contextName } = await getScope(client);

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('webhooks rm <id>')}`
      )}`
    );
    return 1;
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
            next: [{ command: getCommandName('webhooks ls') }],
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
      `Are you sure you want to remove webhook ${param(webhookId)} (${webhook.url})?`,
      false
    ))
  ) {
    if (!client.nonInteractive) output.log('Canceled');
    return 0;
  }

  const removeStamp = stamp();
  if (!client.nonInteractive) {
    output.spinner(`Removing webhook under ${chalk.bold(contextName)}`);
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
            message: `Webhook ${webhookId} removed.`,
          },
          null,
          2
        )}\n`
      );
      return 0;
    }
    output.success(`Webhook ${chalk.bold(webhookId)} removed ${removeStamp()}`);
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
            next: [{ command: getCommandName('webhooks ls') }],
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
