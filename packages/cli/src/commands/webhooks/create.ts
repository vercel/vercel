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
import {
  getWebhookEvents,
  validateWebhookEvents,
} from '../../util/webhooks/get-webhook-events';

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
  let [url] = args;

  // --- Collect URL ---
  if (!url) {
    if (client.nonInteractive) {
      output.error(
        `${getCommandName(`webhooks create <url>`)} expects one argument`
      );
      return 1;
    }
    url = await client.input.text({
      message: 'Webhook URL:',
      validate: (val: string) => {
        if (!val) return 'URL is required';
        try {
          const urlObj = new URL(val);
          if (!['http:', 'https:'].includes(urlObj.protocol)) {
            return 'Webhook URL must use http or https protocol';
          }
        } catch {
          return 'Invalid URL';
        }
        return true;
      },
    });
  } else {
    // Validate URL format when provided as argument
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
  }

  // --- Collect events ---
  const projectIds = opts['--project'] as string[] | undefined;
  const eventFlags = opts['--event'] as string[] | undefined;
  let events: string[];

  if (!eventFlags || eventFlags.length === 0) {
    if (client.nonInteractive) {
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

    const availableEvents = await getWebhookEvents();
    if (availableEvents.length === 0) {
      output.error(
        'Could not fetch available webhook events. Please specify events using --event flags.'
      );
      return 1;
    }

    events = await client.input.checkbox<string>({
      message: 'Select events:',
      choices: availableEvents.map(event => ({
        name: event,
        value: event,
      })),
      validate: (selected: readonly unknown[]) => {
        if (selected.length === 0) return 'At least one event is required';
        return true;
      },
    });
  } else {
    // Validate events against the OpenAPI spec
    const invalidEvents = await validateWebhookEvents(eventFlags);
    if (invalidEvents.length > 0) {
      output.error(
        `Invalid event type${invalidEvents.length > 1 ? 's' : ''}: ${invalidEvents.join(', ')}`
      );
      return 1;
    }
    events = eventFlags;
  }

  telemetry.trackCliArgumentUrl(url);
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
    output.print(`    ${chalk.cyan('ID'.padEnd(10))}${webhook.id}\n`);
    output.print(`    ${chalk.cyan('URL'.padEnd(10))}${webhook.url}\n`);
    output.print(
      `    ${chalk.cyan('Events'.padEnd(10))}${webhook.events.join(', ')}\n`
    );
    if (webhook.projectIds && webhook.projectIds.length > 0) {
      output.print(
        `    ${chalk.cyan('Projects'.padEnd(10))}${webhook.projectIds.join(', ')}\n`
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
