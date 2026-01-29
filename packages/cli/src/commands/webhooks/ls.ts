import ms from 'ms';
import chalk from 'chalk';
import plural from 'pluralize';

import type Client from '../../util/client';
import getWebhooks from '../../util/webhooks/get-webhooks';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import formatTable from '../../util/format-table';
import getCommandFlags from '../../util/get-command-flags';
import { getPaginationOpts } from '../../util/get-pagination-opts';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import { WebhooksLsTelemetryClient } from '../../util/telemetry/commands/webhooks/ls';
import { listSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateLsArgs } from '../../util/validate-ls-args';
import type { Webhook } from '../../util/webhooks/types';

export default async function ls(client: Client, argv: string[]) {
  const telemetry = new WebhooksLsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;

  const validationResult = validateLsArgs({
    commandName: 'webhooks ls',
    args: args,
    maxArgs: 0,
    exitCode: 2,
  });
  if (validationResult !== 0) {
    return validationResult;
  }

  telemetry.trackCliOptionLimit(opts['--limit']);
  telemetry.trackCliOptionNext(opts['--next']);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;
  let paginationOptions: (number | undefined)[];

  try {
    paginationOptions = getPaginationOpts(opts);
  } catch (err: unknown) {
    output.prettyError(err);
    return 1;
  }

  const { contextName } = await getScope(client);

  const lsStamp = stamp();

  output.spinner(`Fetching Webhooks under ${chalk.bold(contextName)}`);

  const { webhooks, pagination } = await getWebhooks(
    client,
    ...paginationOptions
  );

  if (asJson) {
    output.stopSpinner();
    const jsonOutput = {
      webhooks: webhooks.map(webhook => ({
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        projectIds: webhook.projectIds,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
      })),
      pagination,
    };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else {
    output.log(
      `${plural('Webhook', webhooks.length, true)} found under ${chalk.bold(
        contextName
      )} ${chalk.gray(lsStamp())}`
    );

    if (webhooks.length > 0) {
      output.print(
        formatWebhooksTable(webhooks).replace(/^(.*)/gm, `${' '.repeat(1)}$1`)
      );
      output.print('\n\n');
    }

    if (pagination && pagination.count === 20) {
      const flags = getCommandFlags(opts, ['_', '--next', '--format']);
      output.log(
        `To display the next page, run ${getCommandName(
          `webhooks ls${flags} --next ${pagination.next}`
        )}`
      );
    }
  }

  return 0;
}

function formatWebhooksTable(webhooks: Webhook[]) {
  const current = Date.now();

  const rows: string[][] = webhooks.map(webhook => {
    const age = webhook.createdAt ? ms(current - webhook.createdAt) : '-';
    const eventsDisplay =
      webhook.events.length > 2
        ? `${webhook.events.slice(0, 2).join(', ')} +${webhook.events.length - 2}`
        : webhook.events.join(', ');

    return [webhook.id, webhook.url, eventsDisplay, chalk.gray(age)];
  });

  return formatTable(
    ['ID', 'URL', 'Events', 'Age'],
    ['l', 'l', 'l', 'l'],
    [{ rows }]
  );
}
