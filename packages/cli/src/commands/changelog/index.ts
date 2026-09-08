import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import fetch from '../../util/fetch';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getSubcommand from '../../util/get-subcommand';
import output from '../../output-manager';
import ua from '../../util/ua';
import { getCommandAliases } from '..';
import { help, type Command } from '../help';
import { changelogCommand, searchSubcommand } from './command';
import { ChangelogTelemetryClient } from '../../util/telemetry/commands/changelog';
import { validateJsonOutput } from '../../util/output-format';

const CHANGELOG_API_URL = 'https://vercel.com/api/changelog';
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

type ChangelogItem = {
  authors: string[];
  content?: string;
  publishedAt: string;
  slug: string;
  summary: string | null;
  title: string;
  url: string;
};

const COMMAND_CONFIG = {
  search: getCommandAliases(searchSubcommand),
};

function cleanLine(value: string): string {
  return stripAnsi(value).replace(/\s+/g, ' ').trim();
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function isChangelogItem(value: unknown): value is ChangelogItem {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    Array.isArray(item.authors) &&
    item.authors.every(author => typeof author === 'string') &&
    (item.content === undefined || typeof item.content === 'string') &&
    typeof item.publishedAt === 'string' &&
    typeof item.slug === 'string' &&
    (typeof item.summary === 'string' || item.summary === null) &&
    typeof item.title === 'string' &&
    typeof item.url === 'string'
  );
}

function printEntries(items: ChangelogItem[]): void {
  const entries = items.map(item => {
    const date = formatDate(item.publishedAt).padEnd(6);
    const lines = [
      `  ${date}  ${cleanLine(item.title)}`,
      `          ${chalk.cyan(cleanLine(item.url))}`,
    ];
    const content = item.content ? stripAnsi(item.content).trim() : '';
    if (content) {
      lines.push('', content);
    }
    return lines.join('\n');
  });
  output.print(`${entries.join('\n\n')}\n`);
}

async function fetchEntries(
  query: string | undefined,
  limit: number
): Promise<ChangelogItem[] | undefined> {
  const url = new URL(
    query ? `${CHANGELOG_API_URL}/search` : CHANGELOG_API_URL
  );
  url.searchParams.set('limit', String(limit));
  if (query) {
    url.searchParams.set('q', query);
  } else {
    url.searchParams.set('include', 'content');
  }

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': ua,
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        output.error('Too many changelog requests. Try again shortly.');
      } else {
        output.error('Failed to fetch changelog entries.');
      }
      return undefined;
    }

    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid changelog response');
    }
    const items = (data as Record<string, unknown>).items;
    if (!Array.isArray(items) || !items.every(isChangelogItem)) {
      throw new Error('Invalid changelog response');
    }
    return items;
  } catch {
    output.error(
      'Failed to fetch changelog entries. Check your connection and try again.'
    );
    return undefined;
  }
}

function printCommandHelp(client: Client, command: Command): void {
  output.print(
    help(command, {
      columns: client.stderr.columns,
      parent: command === changelogCommand ? undefined : changelogCommand,
    })
  );
}

export default async function changelog(client: Client): Promise<number> {
  const telemetry = new ChangelogTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const flagsSpecification = getFlagsSpecification(changelogCommand.options);
  const rawArgs = client.argv.slice(2).filter(arg => arg !== '--changelog');

  let parsedArgs;
  try {
    parsedArgs = parseArguments(rawArgs, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const commandOffset = parsedArgs.args[0] === changelogCommand.name ? 1 : 0;
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(commandOffset),
    COMMAND_CONFIG
  );
  const needHelp = parsedArgs.flags['--help'];

  if (needHelp) {
    telemetry.trackCliFlagHelp(
      changelogCommand.name,
      subcommand === 'search' ? subcommandOriginal : undefined
    );
    printCommandHelp(
      client,
      subcommand === 'search' ? searchSubcommand : changelogCommand
    );
    return 0;
  }

  if (!subcommand && args.length > 0) {
    output.error(`Unknown changelog command: ${args[0]}`);
    printCommandHelp(client, changelogCommand);
    return 1;
  }

  const limit = parsedArgs.flags['--limit'] ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    output.error(`--limit must be between 1 and ${MAX_LIMIT}.`);
    return 1;
  }
  telemetry.trackCliOptionLimit(parsedArgs.flags['--limit']);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliFlagJson(parsedArgs.flags['--json']);

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;

  let query: string | undefined;
  if (subcommand === 'search') {
    telemetry.trackCliSubcommandSearch(subcommandOriginal);
    query = args.join(' ').trim();
    if (!query) {
      output.error('Search query is required.');
      printCommandHelp(client, searchSubcommand);
      return 1;
    }
  }

  if (!jsonOutput) {
    output.spinner(
      query ? 'Searching the changelog…' : 'Fetching the changelog…'
    );
  }
  const items = await fetchEntries(query, limit);
  if (!jsonOutput) {
    output.stopSpinner();
  }

  if (!items) {
    return 1;
  }
  if (jsonOutput) {
    client.stdout.write(`${JSON.stringify({ items }, null, 2)}\n`);
    return 0;
  }
  if (items.length === 0) {
    output.log(
      query
        ? 'No changelog entries match the query.'
        : 'No changelog entries found.'
    );
    return 0;
  }

  printEntries(items);
  return 0;
}
