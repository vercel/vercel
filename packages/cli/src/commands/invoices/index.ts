import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import getScope from '../../util/get-scope';
import table from '../../util/output/table';
import elapsed from '../../util/output/elapsed';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { validateJsonOutput } from '../../util/output-format';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import { quoteArg } from '../../util/flags/quote-arg';
import { extractDatePortion } from '../../util/billing/format';
import { getCommandNamePlain } from '../../util/pkg-name';
import { InvoicesTelemetryClient } from '../../util/telemetry/commands/invoices';
import output from '../../output-manager';
import { isErrnoException } from '@vercel/error-utils';
import { type Command, help } from '../help';
import { getCommandAliases } from '..';
import {
  invoicesCommand,
  invoiceStatuses,
  listSubcommand,
  upcomingSubcommand,
} from './command';

interface Invoice {
  id?: string;
  invoiceNumber: string | null;
  status: string;
  currency: string;
  subtotal: string;
  total: string;
  amountDue: string;
  createdAt: string;
  issuedAt: string | null;
  dueDate: string | null;
  hostedUrl: string | null;
  lineItems: { description: string; amount: string }[];
}

const COMMAND_CONFIG = {
  ls: getCommandAliases(listSubcommand),
  upcoming: getCommandAliases(upcomingSubcommand),
};

export default async function invoices(client: Client): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification([
        ...invoicesCommand.options,
        ...listSubcommand.options,
        ...upcomingSubcommand.options,
      ])
    );
  } catch (err) {
    printError(err);
    return 1;
  }

  const telemetry = new InvoicesTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(parsedArgs.args[0] === 'help' ? 2 : 1),
    COMMAND_CONFIG
  );
  const needHelp = parsedArgs.flags['--help'];

  if (args.length > 0) {
    output.fatal(
      `Unexpected arguments. Run ${getCommandNamePlain('invoices --help')} for usage.`
    );
    return 1;
  }

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('invoices');
    output.print(help(invoicesCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    telemetry.trackCliFlagHelp('invoices', subcommandOriginal);
    output.print(
      help(command, { parent: invoicesCommand, columns: client.stderr.columns })
    );
    return 2;
  }

  try {
    if (subcommand === 'upcoming') {
      if (needHelp) return printHelp(upcomingSubcommand);
      telemetry.trackCliSubcommandUpcoming(subcommandOriginal);
      return await upcoming(client, telemetry);
    }
    if (needHelp) return printHelp(listSubcommand);
    telemetry.trackCliSubcommandList(subcommandOriginal);
    return await ls(client, telemetry);
  } catch (err) {
    output.prettyError(err);
    return 1;
  }
}

async function ls(
  client: Client,
  telemetry: InvoicesTelemetryClient
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(listSubcommand.options)
    );
  } catch (err) {
    printError(err);
    return 1;
  }
  const { flags } = parsedArgs;

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.fatal(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const limit = flags['--limit'];
  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || limit < 1 || limit > 50)
  ) {
    output.fatal('Use an integer from 1 to 50 for --limit.');
    return 1;
  }

  if (
    flags['--status']?.some(
      status => !invoiceStatuses.some(validStatus => validStatus === status)
    )
  ) {
    output.fatal(
      `Use one of these values for --status: ${invoiceStatuses.join(', ')}.`
    );
    return 1;
  }

  telemetry.trackCliOptionStatus(flags['--status']);
  telemetry.trackCliOptionLimit(flags['--limit']);
  telemetry.trackCliOptionNext(flags['--next']);
  telemetry.trackCliFlagDetails(flags['--details']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  const scope = await resolveScope(client);
  if (!scope) return 1;

  const query = new URLSearchParams();
  if (scope.teamId) query.set('teamId', scope.teamId);
  if (flags['--limit']) query.set('limit', String(flags['--limit']));
  if (flags['--next']) query.set('cursor', flags['--next']);
  for (const status of flags['--status'] ?? []) {
    query.append('statuses', status);
  }

  const start = Date.now();
  if (!asJson) {
    output.spinner(`Fetching invoices for ${chalk.bold(scope.contextName)}…`);
  }

  try {
    const res = await client.fetch<{
      data: Invoice[];
      hasMore: boolean;
      nextCursor: string | null;
    }>(`/v2/invoices?${query}`, { useCurrentTeam: false });

    if (asJson) {
      client.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
      return 0;
    }

    output.log(
      `Invoices for ${chalk.bold(scope.contextName)} ${elapsed(Date.now() - start)}`
    );
    if (res.data.length === 0) {
      output.log(
        flags['--status']
          ? 'No invoices match the current filters.'
          : 'No invoices found.'
      );
      return 0;
    }

    const headers = ['Number', 'Status', 'Date', 'Amount Due', 'Total', 'URL'];
    const rows = res.data.map(inv => [
      inv.invoiceNumber ?? inv.id ?? '-',
      inv.status,
      extractDatePortion(inv.issuedAt ?? inv.createdAt),
      formatAmount(inv.amountDue, inv.currency),
      formatAmount(inv.total, inv.currency),
      inv.hostedUrl ? chalk.cyan(inv.hostedUrl) : '-',
    ]);
    output.print(
      `\n${table([headers.map(h => chalk.bold(chalk.cyan(h))), ...rows], {
        hsep: 3,
        align: ['l', 'l', 'l', 'r', 'r', 'l'],
      }).replace(/^/gm, '  ')}\n\n`
    );

    if (flags['--details']) {
      for (const inv of res.data) {
        output.print(
          `  ${chalk.bold(`Invoice ${inv.invoiceNumber ?? inv.id ?? '-'}`)}\n`
        );
        if (inv.lineItems.length === 0) {
          output.print('  No line items found.\n\n');
          continue;
        }
        const itemRows = inv.lineItems.map(item => [
          item.description,
          formatAmount(item.amount, inv.currency),
        ]);
        output.print(
          `${table(
            [
              ['Item', 'Amount'].map(h => chalk.bold(chalk.cyan(h))),
              ...itemRows,
            ],
            { hsep: 3, align: ['l', 'r'] }
          ).replace(/^/gm, '  ')}\n\n`
        );
      }
    }

    if (res.hasMore && res.nextCursor) {
      const nextArgs = ['invoices', 'ls', '--next', res.nextCursor];
      for (const status of flags['--status'] ?? []) {
        nextArgs.push('--status', status);
      }
      if (flags['--limit'] !== undefined) {
        nextArgs.push('--limit', String(flags['--limit']));
      }
      if (flags['--details']) {
        nextArgs.push('--details');
      }
      nextArgs.push(...getGlobalFlagsFromArgs(client.argv.slice(2)));
      output.log(
        `To display the next page, run:\n  ${getCommandNamePlain(
          nextArgs.map(quoteArg).join(' ')
        )}`
      );
    }
    return 0;
  } catch (err) {
    output.prettyError(err);
    return 1;
  }
}

async function upcoming(
  client: Client,
  telemetry: InvoicesTelemetryClient
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(upcomingSubcommand.options)
    );
  } catch (err) {
    printError(err);
    return 1;
  }
  const { flags } = parsedArgs;

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.fatal(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  const scope = await resolveScope(client);
  if (!scope) return 1;
  if (!scope.teamId) {
    output.fatal(
      'Upcoming invoices are only available for teams. Use --scope to select a team.'
    );
    return 1;
  }

  const start = Date.now();
  if (!asJson) {
    output.spinner(
      `Fetching upcoming invoice for ${chalk.bold(scope.contextName)}…`
    );
  }

  try {
    const res = await client.fetch<{ data: Invoice[] }>(
      `/v1/invoices/upcoming?${new URLSearchParams({ teamId: scope.teamId })}`,
      { useCurrentTeam: false }
    );
    const invoice = res.data[0] ?? null;

    if (asJson) {
      client.stdout.write(`${JSON.stringify(invoice ?? {}, null, 2)}\n`);
      return 0;
    }

    output.log(
      `Upcoming invoice for ${chalk.bold(scope.contextName)} ${elapsed(Date.now() - start)}`
    );
    if (!invoice) {
      output.log('No upcoming invoice found.');
      return 0;
    }
    if (invoice.issuedAt) {
      printAlignedLabel('Invoice Date', extractDatePortion(invoice.issuedAt));
    }

    const rows = invoice.lineItems
      .filter(item => Number(item.amount) !== 0)
      .map(item => [
        item.description,
        formatAmount(item.amount, invoice.currency),
      ]);
    if (rows.length > 0) {
      output.print(
        `\n${table(
          [['Item', 'Amount'].map(h => chalk.bold(chalk.cyan(h))), ...rows],
          {
            hsep: 3,
            align: ['l', 'r'],
          }
        ).replace(/^/gm, '  ')}\n`
      );
    }
    output.print('\n');
    printAlignedLabel(
      'Subtotal',
      formatAmount(invoice.subtotal, invoice.currency)
    );
    printAlignedLabel('Total', formatAmount(invoice.total, invoice.currency));
    output.print('\n');
    return 0;
  } catch (err) {
    output.prettyError(err);
    return 1;
  }
}

async function resolveScope(
  client: Client
): Promise<{ contextName: string; teamId?: string } | null> {
  try {
    const { contextName, team } = await getScope(client);
    return { contextName, teamId: team?.id };
  } catch (err: unknown) {
    if (
      isErrnoException(err) &&
      (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED')
    ) {
      output.fatal(err.message);
      return null;
    }
    throw err;
  }
}

function formatAmount(amount: string, currency: string): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(n);
}
