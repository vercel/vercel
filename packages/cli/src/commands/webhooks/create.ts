import chalk from 'chalk';
import type Client from '../../util/client';
import createWebhook from '../../util/webhooks/create-webhook';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import { getCommandNamePlain } from '../../util/pkg-name';
import { outputAgentError } from '../../util/agent-output';
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

const WEBHOOKS_EVENTS_DOCS_URL =
  'https://vercel.com/docs/webhooks/webhooks-api';

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
      const argv = client.argv.slice(2);
      const subcommandParts = argv.slice(0, 2); // e.g. ['webhooks', 'create']
      const rest = argv.slice(2);
      const subcommandWithPlaceholder = `${subcommandParts.join(' ')} <url>${
        rest.length ? ` ${rest.join(' ')}` : ''
      }`;
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_url',
          message:
            'Webhook URL is required. Provide URL as the first argument.',
          next: [
            {
              command: getCommandNamePlain(subcommandWithPlaceholder),
            },
          ],
        },
        1
      );
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
      const argv = client.argv.slice(2);
      const subcommandParts = argv.slice(0, 2); // ['webhooks', 'create']
      const rest = argv.slice(2);
      const subcommandWithPlaceholder = `${subcommandParts.join(' ')} <url>${
        rest.length ? ` ${rest.join(' ')}` : ''
      }`;
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_events',
          message:
            'At least one event is required. Use --event <event> (can be repeated).',
          next: [
            {
              command: getCommandNamePlain(subcommandWithPlaceholder),
            },
          ],
        },
        1
      );
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
      if (client.nonInteractive) {
        const suggested = buildCreateCommandWithEventPlaceholder(
          client.argv,
          url
        );
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'invalid_arguments',
            message: `Invalid event type${invalidEvents.length > 1 ? 's' : ''}: ${invalidEvents.join(', ')}. Use a valid event name (e.g. deployment.created).`,
            hint: `See available events: ${WEBHOOKS_EVENTS_DOCS_URL}`,
            next: [{ command: suggested, when: 'use a valid --event value' }],
          },
          1
        );
        return 1;
      }
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

  if (!client.nonInteractive) {
    output.spinner(`Creating webhook under ${chalk.bold(contextName)}`);
  }

  try {
    const webhook = await createWebhook(client, {
      url,
      events,
      projectIds,
    });

    if (client.nonInteractive) {
      const json: Record<string, unknown> = {
        status: 'ok',
        webhook: {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          ...(webhook.projectIds?.length
            ? { projectIds: webhook.projectIds }
            : {}),
        },
        message: `Webhook ${webhook.id} created.`,
        next: [
          {
            command: getCommandNamePlain(`webhooks get ${webhook.id}`),
            when: 'Inspect the webhook',
          },
        ],
      };
      if (webhook.secret) json.secret = webhook.secret;
      client.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
      return 0;
    }

    output.stopSpinner();
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
    output.stopSpinner();
    if (isAPIError(err)) {
      if (client.nonInteractive) {
        const reason =
          err.code === 'invalid_url'
            ? 'invalid_url'
            : err.code === 'invalid_event'
              ? 'invalid_event'
              : 'api_error';
        const suggested =
          reason === 'invalid_event'
            ? buildCreateCommandWithEventPlaceholder(client.argv, url)
            : undefined;
        outputAgentError(
          client,
          {
            status: 'error',
            reason,
            message: err.message,
            hint:
              reason === 'invalid_event'
                ? `See available events: ${WEBHOOKS_EVENTS_DOCS_URL}`
                : undefined,
            next:
              suggested !== undefined
                ? [{ command: suggested, when: 'use a valid --event value' }]
                : undefined,
          },
          1
        );
        return 1;
      }
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

/**
 * Builds a plain suggested command from argv, preserving URL and global flags
 * but replacing --event value(s) with <event> for copy-paste when event is invalid.
 */
function buildCreateCommandWithEventPlaceholder(
  fullArgv: string[],
  url: string
): string {
  const argv = fullArgv.slice(2);
  const out: string[] = ['webhooks', 'create', url];
  let i = 3;
  let hadEvent = false;
  while (i < argv.length) {
    if (argv[i] === '--event' || argv[i] === '-e') {
      hadEvent = true;
      i += 2;
      continue;
    }
    out.push(argv[i]);
    i++;
  }
  if (hadEvent) {
    out.push('--event', '<event>');
  }
  return getCommandNamePlain(out.join(' '));
}
