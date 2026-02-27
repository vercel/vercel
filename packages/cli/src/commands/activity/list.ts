import ms from 'ms';
import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { listSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import { validateLsArgs } from '../../util/validate-ls-args';
import { parseTimeFlag } from '../../util/time-utils';
import { ActivityLsTelemetryClient } from '../../util/telemetry/commands/activity/list';
import { getLinkedProject } from '../../util/projects/link';
import getScope from '../../util/get-scope';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound, isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import getCommandFlags from '../../util/get-command-flags';

interface Principal {
  type?: 'user' | 'app' | 'integration' | 'system' | string;
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

function trackTelemetry(
  flags: ListFlags,
  telemetry: ActivityLsTelemetryClient
) {
  const types = normalizeTypeFilters(flags['--type']);
  telemetry.trackCliOptionType(types.length > 0 ? types : undefined);
  telemetry.trackCliOptionSince(flags['--since']);
  telemetry.trackCliOptionUntil(flags['--until']);
  telemetry.trackCliOptionProject(flags['--project']);
  telemetry.trackCliFlagAll(flags['--all']);
  telemetry.trackCliOptionLimit(flags['--limit']);
  telemetry.trackCliOptionNext(flags['--next']);
  telemetry.trackCliOptionFormat(flags['--format']);
}

function normalizeTypeFilters(typeFilters: string[] | undefined): string[] {
  if (!typeFilters || typeFilters.length === 0) {
    return [];
  }

  const normalized = typeFilters
    .flatMap(filter => filter.split(','))
    .map(filter => filter.trim())
    .filter(Boolean);

  return [...new Set(normalized)];
}

function validateAndNormalizeLimit(limit: number | undefined): number | null {
  if (limit === undefined) {
    return 20;
  }

  if (Number.isNaN(limit)) {
    output.error('Please provide a number for flag `--limit`.');
    return null;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    output.error('`--limit` must be an integer between 1 and 100.');
    return null;
  }

  return limit;
}

function resolveUntil(
  next: number | undefined,
  until: string | undefined
): Date | undefined | null {
  if (next !== undefined) {
    if (Number.isNaN(next)) {
      output.error('Please provide a number for flag `--next`.');
      return null;
    }

    const date = new Date(next);
    if (Number.isNaN(date.getTime())) {
      output.error(
        'Please provide a valid unix timestamp in milliseconds for `--next`.'
      );
      return null;
    }

    return date;
  }

  if (!until) {
    return undefined;
  }

  try {
    return parseTimeFlag(until);
  } catch (err) {
    output.error((err as Error).message);
    return null;
  }
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

function formatAge(createdAt: number): string {
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    return '-';
  }

  const age = Math.max(0, Date.now() - createdAt);
  return ms(age);
}

function formatText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function printExpandedEvents(events: UserEventDTO[]) {
  const lines = [''];

  events.forEach((event, index) => {
    lines.push(`  ${chalk.bold(`${index + 1}. ${formatText(event.text)}`)}`);
    lines.push(`     ${chalk.cyan('Type:')} ${event.type ?? '-'}`);
    lines.push(`     ${chalk.cyan('Actor:')} ${formatActor(event)}`);
    lines.push(`     ${chalk.cyan('Age:')} ${formatAge(event.createdAt)}`);
    lines.push(`     ${chalk.cyan('ID:')} ${event.id}`);
    lines.push('');
  });

  output.print(`${lines.join('\n')}\n`);
}

async function resolveScope(
  client: Client,
  opts: { project?: string; all?: boolean }
): Promise<ActivityScope | number> {
  if (opts.all && opts.project) {
    output.error(
      'Cannot specify both --all and --project. Use one or the other.'
    );
    return 1;
  }

  if (opts.all || opts.project) {
    const { team } = await getScope(client);
    if (!team) {
      output.error(
        'No team context found. Run `vercel switch` to select a team, or use `vercel link` in a project directory.'
      );
      return 1;
    }

    if (opts.all) {
      return {
        teamId: team.id,
        teamSlug: team.slug,
      };
    }

    const project = await getProjectByNameOrId(client, opts.project!, team.id);
    if (project instanceof ProjectNotFound) {
      output.error(
        `Project "${opts.project}" was not found in team "${team.slug}".`
      );
      return 1;
    }

    return {
      teamId: team.id,
      teamSlug: team.slug,
      projectIds: [project.id],
    };
  }

  const linkedProject = await getLinkedProject(client);
  if (linkedProject.status === 'error') {
    return linkedProject.exitCode;
  }

  if (linkedProject.status === 'not_linked') {
    output.error(
      'No linked project found. Run `vercel link` to link a project, or use --project <name> or --all.'
    );
    return 1;
  }

  const isTeamProject = linkedProject.org.type === 'team';

  return {
    projectIds: [linkedProject.project.id],
    teamId: isTeamProject ? linkedProject.org.id : undefined,
    teamSlug: isTeamProject ? linkedProject.org.slug : undefined,
  };
}

export default async function list(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new ActivityLsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs as {
    args: string[];
    flags: ListFlags;
  };

  const argValidationResult = validateLsArgs({
    commandName: 'activity ls',
    args,
    maxArgs: 0,
    exitCode: 2,
  });
  if (argValidationResult !== 0) {
    return argValidationResult;
  }

  trackTelemetry(flags, telemetry);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  const jsonOutput = formatResult.jsonOutput;

  const limit = validateAndNormalizeLimit(flags['--limit']);
  if (limit === null) {
    return 1;
  }

  const types = normalizeTypeFilters(flags['--type']);

  const scope = await resolveScope(client, {
    project: flags['--project'],
    all: flags['--all'],
  });
  if (typeof scope === 'number') {
    return scope;
  }

  let since: Date | undefined;
  if (flags['--since']) {
    try {
      since = parseTimeFlag(flags['--since']);
    } catch (err) {
      output.error((err as Error).message);
      return 1;
    }
  }

  const until = resolveUntil(flags['--next'], flags['--until']);
  if (until === null) {
    return 1;
  }

  if (since && until && since.getTime() > until.getTime()) {
    output.error('`--since` must be earlier than `--until`.');
    return 1;
  }

  const query = new URLSearchParams({
    limit: String(limit + 1),
  });

  if (types.length > 0) {
    query.set('types', types.join(','));
  }

  if (since) {
    query.set('since', since.toISOString());
  }

  if (until) {
    query.set('until', until.toISOString());
  }

  if (scope.projectIds && scope.projectIds.length > 0) {
    query.set('projectIds', scope.projectIds.join(','));
  }

  if (scope.teamId) {
    query.set('teamId', scope.teamId);
  }

  if (scope.teamSlug) {
    query.set('slug', scope.teamSlug);
  }

  if (jsonOutput) {
    query.set('withPayload', 'true');
  }

  try {
    const response = await client.fetch<UserEventsResponse>(
      `/v3/events?${query.toString()}`,
      {
        useCurrentTeam: false,
      }
    );

    const allEvents = Array.isArray(response.events) ? response.events : [];
    const events = allEvents.slice(0, limit);
    const hasMore = allEvents.length > limit;
    const lastVisibleEvent = events[events.length - 1];
    const next =
      hasMore && typeof lastVisibleEvent?.createdAt === 'number'
        ? lastVisibleEvent.createdAt - 1
        : null;

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
      const commandFlags = getCommandFlags(flags, ['--next']);
      output.log(
        `To display the next page, run ${getCommandName(
          `activity ls${commandFlags} --next ${next}`
        )}`
      );
    }

    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      if (err.status === 403) {
        output.error(
          'You do not have permission to list activity events. Required permissions: Event: List or OwnEvent: List.'
        );
        return 1;
      }

      output.error(err.serverMessage || `API error (${err.status}).`);
      return 1;
    }

    throw err;
  }
}
