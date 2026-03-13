import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { activityCommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import type { ActivityTelemetryClient } from '../../util/telemetry/commands/activity';
import { getLinkedProject } from '../../util/projects/link';
import getScope from '../../util/get-scope';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound, isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import getCommandFlags from '../../util/get-command-flags';
import {
  type ValidatedResult,
  normalizeRepeatableStringFilters,
  validateAllProjectMutualExclusivity,
  validateIntegerRangeWithDefault,
  validateTimeBound,
  validateTimeOrder,
  outputError,
  handleValidationError,
} from '../../util/command-validation';

interface Principal {
  type?: string;
  username?: string;
  name?: string;
  slug?: string;
  email?: string;
}

interface UserEventDTO {
  id: string;
  createdAt: number;
  text: string;
  type?: string;
  principalId: string;
  principal?: Principal;
  payload?: Record<string, unknown>;
}

interface UserEventsResponse {
  events: UserEventDTO[];
}

interface ActivityScope {
  projectIds?: string[];
  teamId?: string;
  teamSlug?: string;
}

interface ListFlags {
  '--type'?: string[];
  '--since'?: string;
  '--until'?: string;
  '--project'?: string;
  '--all'?: boolean;
  '--limit'?: number;
  '--next'?: number;
  '--format'?: string;
}

type ValidatedInputs = {
  limit: number;
  types: string[];
  since: Date | undefined;
  until: Date | undefined;
};

type PaginatedEvents = {
  events: UserEventDTO[];
  next: number | null;
};

function validateNext(
  next: number | undefined
): ValidatedResult<Date | undefined> {
  if (next === undefined) {
    return { valid: true, value: undefined };
  }

  if (Number.isNaN(next)) {
    return {
      valid: false,
      code: 'INVALID_NEXT',
      message: 'Please provide a number for flag `--next`.',
    };
  }

  const date = new Date(next);
  if (Number.isNaN(date.getTime())) {
    return {
      valid: false,
      code: 'INVALID_NEXT',
      message:
        'Please provide a valid unix timestamp in milliseconds for `--next`.',
    };
  }

  return { valid: true, value: date };
}

function handleApiError(
  err: { status: number; code?: string; serverMessage?: string },
  jsonOutput: boolean,
  client: Client
): number {
  if (err.status === 403) {
    return outputError(
      client,
      jsonOutput,
      'FORBIDDEN',
      'You do not have permission to list activity events. Required permissions: Event: List or OwnEvent: List.'
    );
  }

  return outputError(
    client,
    jsonOutput,
    err.code || 'API_ERROR',
    err.serverMessage || `API error (${err.status}).`
  );
}

function formatActor(event: UserEventDTO): string {
  const principal = event.principal;
  if (!principal) {
    return event.principalId || '-';
  }

  if (principal.type === 'system') {
    return 'system';
  }

  if (principal.username) {
    return principal.username;
  }

  if (principal.name) {
    return principal.name;
  }

  if (principal.slug) {
    return principal.slug;
  }

  if (principal.email) {
    return principal.email;
  }

  return event.principalId || '-';
}

function formatTimestamp(createdAt: number): string {
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    return '-';
  }

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toISOString();
}

function formatEventText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function printExpandedEvents(events: UserEventDTO[]) {
  const lines = [''];

  events.forEach(event => {
    lines.push(`${chalk.gray('-')} ${formatEventText(event.text)}`);
    lines.push(`    ${chalk.cyan('Type'.padEnd(14))}${event.type ?? '-'}`);
    lines.push(`    ${chalk.cyan('Actor'.padEnd(14))}${formatActor(event)}`);
    lines.push(
      `    ${chalk.cyan('Timestamp'.padEnd(14))}${formatTimestamp(event.createdAt)}`
    );
    lines.push(`    ${chalk.cyan('ID'.padEnd(14))}${event.id}`);
    lines.push('');
  });

  output.print(`${lines.join('\n')}\n`);
}

function trackTelemetry(
  flags: ListFlags,
  types: string[],
  telemetry: ActivityTelemetryClient
) {
  telemetry.trackCliOptionType(types.length > 0 ? types : undefined);
  telemetry.trackCliOptionSince(flags['--since']);
  telemetry.trackCliOptionUntil(flags['--until']);
  telemetry.trackCliOptionProject(flags['--project']);
  telemetry.trackCliFlagAll(flags['--all']);
  telemetry.trackCliOptionLimit(flags['--limit']);
  telemetry.trackCliOptionNext(flags['--next']);
  telemetry.trackCliOptionFormat(flags['--format']);
}

function parseFlags(client: Client): ListFlags | number {
  const flagsSpecification = getFlagsSpecification(activityCommand.options);
  try {
    const parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
    return parsedArgs.flags as ListFlags;
  } catch (err) {
    printError(err);
    return 1;
  }
}

function resolveValidatedInputs(
  flags: ListFlags,
  jsonOutput: boolean,
  client: Client,
  normalizedTypes: string[]
): ValidatedInputs | number {
  const limitResult = validateIntegerRangeWithDefault(flags['--limit'], {
    flag: '--limit',
    min: 1,
    max: 100,
    defaultValue: 20,
  });
  if (!limitResult.valid) {
    return handleValidationError(limitResult, jsonOutput, client);
  }

  const mutualResult = validateAllProjectMutualExclusivity(
    flags['--all'],
    flags['--project']
  );
  if (!mutualResult.valid) {
    return handleValidationError(mutualResult, jsonOutput, client);
  }

  const sinceResult = validateTimeBound(flags['--since']);
  if (!sinceResult.valid) {
    return handleValidationError(sinceResult, jsonOutput, client);
  }

  const nextResult = validateNext(flags['--next']);
  if (!nextResult.valid) {
    return handleValidationError(nextResult, jsonOutput, client);
  }

  let until: Date | undefined = nextResult.value;
  if (!until) {
    const untilResult = validateTimeBound(flags['--until']);
    if (!untilResult.valid) {
      return handleValidationError(untilResult, jsonOutput, client);
    }
    until = untilResult.value;
  }

  const since = sinceResult.value;
  const timeOrderResult = validateTimeOrder(since, until);
  if (!timeOrderResult.valid) {
    return handleValidationError(timeOrderResult, jsonOutput, client);
  }

  return {
    limit: limitResult.value,
    types: normalizedTypes,
    since,
    until,
  };
}

async function resolveScope(
  client: Client,
  opts: { project?: string; all?: boolean; jsonOutput: boolean }
): Promise<ActivityScope | number> {
  if (opts.all || opts.project) {
    const { team } = await getScope(client);
    if (!team) {
      return outputError(
        client,
        opts.jsonOutput,
        'NO_TEAM',
        'No team context found. Run `vercel switch` to select a team, or use `vercel link` in a project directory.'
      );
    }

    if (opts.all) {
      return {
        teamId: team.id,
        teamSlug: team.slug,
      };
    }

    let projectResult: Awaited<ReturnType<typeof getProjectByNameOrId>>;
    try {
      projectResult = await getProjectByNameOrId(
        client,
        opts.project!,
        team.id
      );
    } catch (err) {
      if (isAPIError(err)) {
        return outputError(
          client,
          opts.jsonOutput,
          err.code || 'API_ERROR',
          err.serverMessage ||
            (err.status === 403
              ? `You do not have permission to access project "${opts.project}" in team "${team.slug}".`
              : `API error (${err.status}).`)
        );
      }
      throw err;
    }

    if (projectResult instanceof ProjectNotFound) {
      return outputError(
        client,
        opts.jsonOutput,
        'PROJECT_NOT_FOUND',
        `Project "${opts.project}" was not found in team "${team.slug}".`
      );
    }

    return {
      teamId: team.id,
      teamSlug: team.slug,
      projectIds: [projectResult.id],
    };
  }

  const linkedProject = await getLinkedProject(client);
  if (linkedProject.status === 'error') {
    return linkedProject.exitCode;
  }

  if (linkedProject.status === 'not_linked') {
    return outputError(
      client,
      opts.jsonOutput,
      'NOT_LINKED',
      'No linked project found. Run `vercel link` to link a project, or use --project <name> or --all.'
    );
  }

  const isTeamProject = linkedProject.org.type === 'team';
  return {
    projectIds: [linkedProject.project.id],
    teamId: isTeamProject ? linkedProject.org.id : undefined,
    teamSlug: isTeamProject ? linkedProject.org.slug : undefined,
  };
}

function buildEventsQuery(params: {
  limit: number;
  types: string[];
  since: Date | undefined;
  until: Date | undefined;
  scope: ActivityScope;
  jsonOutput: boolean;
}): URLSearchParams {
  const query = new URLSearchParams({
    limit: String(params.limit + 1),
  });

  if (params.types.length > 0) {
    query.set('types', params.types.join(','));
  }
  if (params.since) {
    query.set('since', params.since.toISOString());
  }
  if (params.until) {
    query.set('until', params.until.toISOString());
  }
  if (params.scope.projectIds && params.scope.projectIds.length > 0) {
    query.set('projectIds', params.scope.projectIds.join(','));
  }
  if (params.scope.teamId) {
    query.set('teamId', params.scope.teamId);
  }
  if (params.scope.teamSlug) {
    query.set('slug', params.scope.teamSlug);
  }
  if (params.jsonOutput) {
    query.set('withPayload', 'true');
  }

  return query;
}

function paginateEvents(
  allEvents: UserEventDTO[],
  limit: number
): PaginatedEvents {
  const events = allEvents.slice(0, limit);
  const hasMore = allEvents.length > limit;
  const lastVisibleEvent = events[events.length - 1];
  const next =
    hasMore && typeof lastVisibleEvent?.createdAt === 'number'
      ? lastVisibleEvent.createdAt - 1
      : null;

  return { events, next };
}

function printNextPageHint(flags: ListFlags, next: number) {
  const commandFlags = getCommandFlags(flags, ['--next']);
  output.log(
    `To display the next page, run ${getCommandName(
      `activity${commandFlags} --next ${next}`
    )}`
  );
}

export default async function list(
  client: Client,
  telemetry: ActivityTelemetryClient
): Promise<number> {
  const flags = parseFlags(client);
  if (typeof flags === 'number') {
    return flags;
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;

  const normalizedTypes = normalizeRepeatableStringFilters(flags['--type']);
  trackTelemetry(flags, normalizedTypes, telemetry);

  const validatedInputs = resolveValidatedInputs(
    flags,
    jsonOutput,
    client,
    normalizedTypes
  );
  if (typeof validatedInputs === 'number') {
    return validatedInputs;
  }

  const scope = await resolveScope(client, {
    project: flags['--project'],
    all: flags['--all'],
    jsonOutput,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  const query = buildEventsQuery({
    limit: validatedInputs.limit,
    types: validatedInputs.types,
    since: validatedInputs.since,
    until: validatedInputs.until,
    scope,
    jsonOutput,
  });

  output.spinner('Fetching activity...');
  try {
    const response = await client.fetch<UserEventsResponse>(
      `/v3/events?${query.toString()}`,
      {
        useCurrentTeam: false,
      }
    );

    const allEvents = Array.isArray(response.events) ? response.events : [];
    const { events, next } = paginateEvents(allEvents, validatedInputs.limit);

    if (jsonOutput) {
      client.stdout.write(
        `${JSON.stringify({ events, pagination: { next } }, null, 2)}\n`
      );
      return 0;
    }

    if (events.length === 0) {
      output.log('No activity events found.');
      return 0;
    }

    printExpandedEvents(events);
    if (next !== null) {
      printNextPageHint(flags, next);
    }

    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      return handleApiError(err, jsonOutput, client);
    }
    throw err;
  } finally {
    output.stopSpinner();
  }
}
