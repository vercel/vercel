import chalk from 'chalk';
import type Client from '../../util/client';
import deleteWebhook from '../../util/webhooks/delete-webhook';
import getWebhook from '../../util/webhooks/get-webhook';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';
import { getCommandName } from '../../util/pkg-name';
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
    output.error(`${getCommandName(`webhooks rm <id>`)} expects one argument`);
    return 1;
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
  output.spinner(`Fetching webhook ${webhookId}`);
  let webhook;
  try {
    webhook = await getWebhook(client, webhookId);
  } catch (err: unknown) {
    if (isAPIError(err) && err.status === 404) {
      output.error(`Webhook not found: ${webhookId}`);
      output.log(`Run ${getCommandName(`webhooks ls`)} to see your webhooks.`);
      return 1;
    }
    throw err;
  }

  output.stopSpinner();

  const skipConfirmation = opts['--yes'] || false;
  if (
    !skipConfirmation &&
    !(await client.input.confirm(
      `Are you sure you want to remove webhook ${param(webhookId)} (${webhook.url})?`,
      false
    ))
  ) {
    output.log('Canceled');
    return 0;
  }

  const removeStamp = stamp();
  output.spinner(`Removing webhook under ${chalk.bold(contextName)}`);

  try {
    await deleteWebhook(client, webhookId);
    output.success(`Webhook ${chalk.bold(webhookId)} removed ${removeStamp()}`);
    return 0;
  } catch (err: unknown) {
    if (isAPIError(err) && err.status === 404) {
      output.error(`Webhook not found: ${webhookId}`);
      return 1;
    }
    throw err;
  }
}
