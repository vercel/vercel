import chalk from 'chalk';
import ms from 'ms';
import { format } from 'date-fns';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { validateJsonOutput } from '../../util/output-format';
import { EventsTelemetryClient } from '../../util/telemetry/commands/events';
import { help } from '../help';
import { eventsCommand } from './command';
import output from '../../output-manager';
import { isErrnoException } from '@vercel/error-utils';

interface EventEntity {
  type: string;
  start: number;
  end: number;
}

interface EventUser {
  username: string;
  avatar?: string;
  email?: string;
  slug?: string;
  uid: string;
}

interface EventEntry {
  id: string;
  text: string;
  entities: EventEntity[];
  createdAt: number;
  user?: EventUser;
  userId?: string;
  principalId?: string;
  payload?: Record<string, unknown>;
}

interface EventsResponse {
  events: EventEntry[];
}

function parseTimeValue(input: string): string {
  const msValue = ms(input);
  if (typeof msValue === 'number') {
    return new Date(Date.now() - msValue).toISOString();
  }
  const date = new Date(input);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }
  throw new Error(`Invalid time format: ${input}`);
}

const TIME_ONLY_FORMAT = 'HH:mm:ss';
const DATE_TIME_FORMAT = 'MMM DD HH:mm:ss';

function eventsSpanMultipleDays(events: EventEntry[]): boolean {
  if (events.length === 0) return false;
  const firstDay = new Date(events[0].createdAt).toDateString();
  return events.some(
    event => new Date(event.createdAt).toDateString() !== firstDay
  );
}

export default async function events(client: Client): Promise<number> {
  const flagsSpecification = getFlagsSpecification(eventsCommand.options);

  let parsedArguments;
  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const telemetry = new EventsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArguments.flags['--help']) {
    telemetry.trackCliFlagHelp('events');
    output.print(help(eventsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArguments.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const sinceOption = parsedArguments.flags['--since'] as string | undefined;
  const untilOption = parsedArguments.flags['--until'] as string | undefined;
  const limitOption = parsedArguments.flags['--limit'] as number | undefined;
  const typesOption = parsedArguments.flags['--types'] as string[] | undefined;
  const principalIdOption = parsedArguments.flags['--principal-id'] as
    | string
    | undefined;
  const projectIdsOption = parsedArguments.flags['--project-ids'] as
    | string[]
    | undefined;
  const withPayloadOption = parsedArguments.flags['--with-payload'] as
    | boolean
    | undefined;

  try {
    await getScope(client);
  } catch (err: unknown) {
    if (
      isErrnoException(err) &&
      (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED')
    ) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  const query = new URLSearchParams();

  const limit = limitOption ?? 25;
  query.set('limit', String(limit));

  if (sinceOption) {
    try {
      query.set('since', parseTimeValue(sinceOption));
    } catch {
      output.error(
        `Invalid --since value: "${sinceOption}". Use ISO format or relative time (e.g. 1h, 7d).`
      );
      return 1;
    }
  }

  if (untilOption) {
    try {
      query.set('until', parseTimeValue(untilOption));
    } catch {
      output.error(
        `Invalid --until value: "${untilOption}". Use ISO format or relative time (e.g. 1h, 7d).`
      );
      return 1;
    }
  }

  if (typesOption && typesOption.length > 0) {
    query.set('types', typesOption.join(','));
  }

  if (principalIdOption) {
    query.set('principalId', principalIdOption);
  }

  if (projectIdsOption && projectIdsOption.length > 0) {
    query.set('projectIds', projectIdsOption.join(','));
  }

  if (withPayloadOption) {
    query.set('withPayload', 'true');
  }

  output.spinner('Fetching events...', 1000);

  let data: EventsResponse;
  try {
    data = await client.fetch<EventsResponse>(`/v3/events?${query}`);
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  output.stopSpinner();

  if (asJson) {
    client.stdout.write(`${JSON.stringify(data.events, null, 2)}\n`);
    return 0;
  }

  const { events: eventsList } = data;

  if (eventsList.length === 0) {
    output.print(chalk.dim('No events found.\n'));
    return 0;
  }

  const showDate = eventsSpanMultipleDays(eventsList);
  const timeFormat = showDate ? DATE_TIME_FORMAT : TIME_ONLY_FORMAT;

  const maxUserLen = Math.max(
    4, // "USER" header
    ...eventsList.map(e => (e.user?.username ?? '').length)
  );
  const userColWidth = Math.min(maxUserLen, 20);

  for (const event of eventsList) {
    const time = chalk.dim(format(event.createdAt, timeFormat));
    const user = (event.user?.username ?? '').padEnd(userColWidth);
    const text = event.text;
    output.print(`${time}  ${chalk.cyan(user)}  ${text}\n`);
  }

  output.print(chalk.gray(`\nShowing ${eventsList.length} events\n`));

  return 0;
}
