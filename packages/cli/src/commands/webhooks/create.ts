import chalk from 'chalk';
import type Client from '../../util/client';
import createWebhook from '../../util/webhooks/create-webhook';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { WebhooksCreateTelemetryClient } from '../../util/telemetry/commands/webhooks/create';
import { createSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { validateWebhookEvents } from '../../util/webhooks/get-webhook-events';

export default async function create(client: Client, argv: string[]) {
  const telemetry = new WebhooksCreateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(createSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;
  const [url] = args;

  telemetry.trackCliArgumentUrl(url);

  if (!url) {
    output.error(
      `${getCommandName(`webhooks create <url>`)} expects one argument`
    );
    return 1;
  }

  // Validate URL format
  try {
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      output.error('Webhook URL must use http or https protocol');
      return 1;
    }
  } catch {
    output.error(`Invalid URL: ${url}`);
    return 1;
  }

  const events = opts['--event'] as string[] | undefined;
  const projectIds = opts['--project'] as string[] | undefined;

  if (!events || events.length === 0) {
    output.error(
      `At least one event is required. Use ${chalk.cyan('--event <event>')} to specify events.`
    );
    output.log(
      `Example: ${getCommandName(
        'webhooks create https://example.com/webhook --event deployment.created'
      )}`
    );
    return 1;
  }

  // Validate events against the OpenAPI spec
  const invalidEvents = await validateWebhookEvents(events);
  if (invalidEvents.length > 0) {
    output.error(
      `Invalid event type${invalidEvents.length > 1 ? 's' : ''}: ${invalidEvents.join(', ')}`
    );
    return 1;
  }

  telemetry.trackCliOptionEvent(events);
  telemetry.trackCliOptionProject(projectIds);

  const { contextName } = await getScope(client);

  const createStamp = stamp();

  output.spinner(`Creating webhook under ${chalk.bold(contextName)}`);

  try {
    const webhook = await createWebhook(client, {
      url,
      events,
      projectIds,
    });

    output.success(
      `Webhook created: ${chalk.bold(webhook.id)} ${createStamp()}`
    );
    output.print('\n');
    output.print(chalk.bold('  Webhook Details\n\n'));
    output.print(`    ${chalk.cyan('ID')}\t\t${webhook.id}\n`);
    output.print(`    ${chalk.cyan('URL')}\t\t${webhook.url}\n`);
    output.print(
      `    ${chalk.cyan('Events')}\t\t${webhook.events.join(', ')}\n`
    );
    if (webhook.projectIds && webhook.projectIds.length > 0) {
      output.print(
        `    ${chalk.cyan('Projects')}\t${webhook.projectIds.join(', ')}\n`
      );
    }
    output.print('\n');
    output.warn(
      `Save this secret - it will not be shown again: ${chalk.bold(webhook.secret)}`
    );
    output.print('\n');

    return 0;
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.code === 'invalid_url') {
        output.error(`Invalid webhook URL: ${url}`);
        return 1;
      }
      if (err.code === 'invalid_event') {
        output.error(`Invalid event type. Please check the event names.`);
        return 1;
      }
      output.error(err.message);
      return 1;
    }
    throw err;
  }
}
