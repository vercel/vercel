import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { resolveTimeRange } from '../../util/time-utils';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import { logsListSubcommand } from './command';
import { fetchLogsList, resolveLogsContext } from './logs-api';
import { renderLogsTable } from './logs-format';
import {
  argvRequestsLogsJson,
  outputLogsApiError,
  outputLogsError,
  outputMissingLogsTeam,
  shouldUseLogsJson,
} from './logs-output';
import { AiGatewayLogsListTelemetryClient } from '../../util/telemetry/commands/ai-gateway/logs-list';
import { AGENT_REASON } from '../../util/agent-output-constants';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export default async function list(client: Client, argv: string[]) {
  const telemetry = new AiGatewayLogsListTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const flagsSpecification = getFlagsSpecification(logsListSubcommand.options);
  let parsedArgs;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (shouldUseLogsJson(client, argvRequestsLogsJson(argv))) {
      return outputLogsError(
        client,
        {
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: error instanceof Error ? error.message : String(error),
        },
        true
      );
    }
    printError(error);
    return 1;
  }
  const { flags: opts } = parsedArgs;
  const project = opts['--project'];
  const since = opts['--since'];
  const until = opts['--until'];
  const search = opts['--search'];
  const environment = opts['--environment'];
  const provider = opts['--provider'];
  const model = opts['--model'];
  const status = opts['--status'];
  const page = opts['--page'] ?? 1;
  const limit = opts['--limit'] ?? DEFAULT_LIMIT;

  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliOptionSearch(search);
  telemetry.trackCliOptionEnvironment(environment);
  telemetry.trackCliOptionProvider(provider);
  telemetry.trackCliOptionModel(model);
  telemetry.trackCliOptionStatus(status);
  telemetry.trackCliOptionPage(opts['--page']);
  telemetry.trackCliOptionLimit(opts['--limit']);
  telemetry.trackCliOptionFormat(opts['--format']);
  telemetry.trackCliFlagJson(opts['--json']);

  const formatResult = validateJsonOutput(opts);
  const requestedJson =
    opts['--json'] === true || opts['--format']?.toLowerCase() === 'json';
  const jsonOutput = shouldUseLogsJson(client, requestedJson);
  if (!formatResult.valid) {
    return outputLogsError(
      client,
      {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: formatResult.error,
      },
      jsonOutput
    );
  }
  if (!Number.isInteger(page) || page < 1) {
    return outputLogsError(
      client,
      {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: 'Page must be an integer greater than 0.',
      },
      jsonOutput
    );
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return outputLogsError(
      client,
      {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `Limit must be an integer from 1 to ${MAX_LIMIT}.`,
      },
      jsonOutput
    );
  }
  if (status && !/^(?:[1-5]xx|\d{3})$/.test(status)) {
    return outputLogsError(
      client,
      {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: 'Status must be an HTTP code or class, such as 200 or 5xx.',
      },
      jsonOutput
    );
  }

  let timeRange;
  try {
    timeRange = resolveTimeRange(since || '1h', until);
  } catch (error) {
    return outputLogsError(
      client,
      {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: error instanceof Error ? error.message : String(error),
      },
      jsonOutput
    );
  }
  if (timeRange.startTime >= timeRange.endTime) {
    return outputLogsError(
      client,
      {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: 'The --since time must be before --until.',
      },
      jsonOutput
    );
  }

  if (!client.config.currentTeam && jsonOutput) {
    return outputMissingLogsTeam(client, 'list');
  }

  let context;
  try {
    context = await resolveLogsContext(client);
  } catch (error) {
    return outputLogsApiError(
      client,
      error,
      jsonOutput,
      'vercel ai-gateway logs list --scope <team-slug> --json'
    );
  }
  if (!context) return 1;

  // Resolve the project after the team so lookup uses the same scope as the
  // request-log query.
  let projectId: string | undefined;
  if (project) {
    try {
      const resolved = await getProjectByNameOrId(client, project);
      if (resolved instanceof ProjectNotFound) {
        return outputLogsError(
          client,
          {
            reason: AGENT_REASON.PROJECT_NOT_FOUND,
            message: 'The project was not found in the selected team.',
          },
          jsonOutput
        );
      }
      projectId = resolved.id;
    } catch (error) {
      return outputLogsApiError(
        client,
        error,
        jsonOutput,
        'vercel ai-gateway logs list --scope <team-slug> --json'
      );
    }
  }

  if (!jsonOutput) output.spinner('Fetching AI Gateway logs…');
  let result;
  try {
    result = await fetchLogsList(client, {
      context,
      projectId,
      startTime: timeRange.startTime,
      endTime: timeRange.endTime,
      provider,
      model,
      status,
      search,
      environment,
      page,
      limit,
    });
  } catch (error) {
    if (!jsonOutput) output.stopSpinner();
    return outputLogsApiError(
      client,
      error,
      jsonOutput,
      'vercel ai-gateway logs list --scope <team-slug> --json'
    );
  }
  if (!jsonOutput) output.stopSpinner();

  const hasMore = result.returned === limit;
  const response = {
    status: 'success',
    reason: 'ai_gateway_logs_listed',
    message:
      result.logs.length === 0
        ? 'No AI Gateway requests matched the query.'
        : `Found ${result.logs.length} AI Gateway ${result.logs.length === 1 ? 'request' : 'requests'}.`,
    data: {
      team: { id: context.teamId, slug: context.teamSlug },
      filters: {
        projectId: projectId ?? null,
        startTime: timeRange.startTime.toISOString(),
        endTime: timeRange.endTime.toISOString(),
        search: search ?? null,
        environment: environment ?? null,
        provider: provider ?? null,
        model: model ?? null,
        status: status ?? null,
      },
      requests: result.logs,
      pagination: {
        page,
        limit,
        returned: result.returned,
        hasMore,
        nextPage: hasMore ? page + 1 : null,
      },
    },
    next:
      result.logs.length === 0
        ? [
            {
              command:
                'vercel ai-gateway logs list --scope <team-slug> --since 24h --json',
              when: 'Search a broader time range',
            },
          ]
        : [
            {
              command:
                'vercel ai-gateway logs inspect <generationId> --scope <team-slug> --json',
              when: 'Inspect a request from data.requests',
            },
          ],
  };
  if (jsonOutput) {
    client.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    return 0;
  }

  if (result.logs.length === 0) {
    const filtered = Boolean(
      project ||
        provider ||
        model ||
        status ||
        since ||
        until ||
        search ||
        environment
    );
    output.log(
      filtered
        ? 'No AI Gateway requests match the current filters.'
        : 'No AI Gateway requests found.'
    );
    return 0;
  }

  output.log(
    `AI Gateway logs · ${chalk.bold(context.teamSlug)} · page ${page}`
  );
  client.stdout.write(renderLogsTable(result.logs));
  if (hasMore) {
    output.log(`Use --page ${page + 1} with the same filters for more.`);
  }
  return 0;
}
