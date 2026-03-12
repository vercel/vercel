import chalk from 'chalk';
import type Client from '../../util/client';
import stamp from '../../util/output/stamp';
import formatDate from '../../util/format-date';
import getWebhook from '../../util/webhooks/get-webhook';
import getScope from '../../util/get-scope';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { WebhooksGetTelemetryClient } from '../../util/telemetry/commands/webhooks/get';
import output from '../../output-manager';
import { getSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';

export default async function get(client: Client, argv: string[]) {
  const telemetry = new WebhooksGetTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(getSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;
  const [webhookId] = args;

  const getStamp = stamp();

  if (!webhookId) {
    output.error(`${getCommandName(`webhooks get <id>`)} expects one argument`);
    return 1;
  }

  telemetry.trackCliArgumentId(webhookId);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('webhooks get <id>')}`
      )}`
    );
    return 1;
  }

  output.debug(`Fetching webhook info`);

  const { contextName } = await getScope(client);
  output.spinner(
    `Fetching Webhook ${webhookId} under ${chalk.bold(contextName)}`
  );

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

  if (asJson) {
    output.stopSpinner();
    client.stdout.write(`${JSON.stringify(webhook, null, 2)}\n`);
  } else {
    output.log(
      `Webhook ${webhookId} found under ${chalk.bold(contextName)} ${chalk.gray(
        getStamp()
      )}`
    );
    output.print('\n');
    output.print(chalk.bold('  General\n\n'));
    output.print(`    ${chalk.cyan('ID')}\t\t\t${webhook.id}\n`);
    output.print(`    ${chalk.cyan('URL')}\t\t\t${webhook.url}\n`);
    output.print(
      `    ${chalk.cyan('Created At')}\t\t${formatDate(webhook.createdAt)}\n`
    );
    output.print(
      `    ${chalk.cyan('Updated At')}\t\t${formatDate(webhook.updatedAt)}\n`
    );

    output.print('\n');
    output.print(chalk.bold('  Events\n\n'));
    for (const event of webhook.events) {
      output.print(`    - ${event}\n`);
    }

    if (webhook.projectIds && webhook.projectIds.length > 0) {
      output.print('\n');
      output.print(chalk.bold('  Projects\n\n'));
      if (webhook.projectsMetadata && webhook.projectsMetadata.length > 0) {
        for (const project of webhook.projectsMetadata) {
          output.print(`    - ${project.name} (${project.id})\n`);
        }
      } else {
        for (const projectId of webhook.projectIds) {
          output.print(`    - ${projectId}\n`);
        }
      }
    }

    output.print('\n');
  }

  return 0;
}
