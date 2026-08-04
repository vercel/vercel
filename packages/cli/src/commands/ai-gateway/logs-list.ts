import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { resolveTimeRange } from '../../util/time-utils';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { isAPIError, ProjectNotFound } from '../../util/errors-ts';
import { logsListSubcommand } from './command';
import { fetchLogsList, resolveLogsContext } from './logs-api';
import { renderLogsTable } from './logs-format';
import { AiGatewayLogsListTelemetryClient } from '../../util/telemetry/commands/ai-gateway/logs-list';

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
    printError(error);
    return 1;
  }
  const { flags: opts } = parsedArgs;
  const project = opts['--project'];
  const since = opts['--since'];
  const until = opts['--until'];
  const provider = opts['--provider'];
  const model = opts['--model'];
  const status = opts['--status'];
  const page = opts['--page'] ?? 1;
  const limit = opts['--limit'] ?? DEFAULT_LIMIT;

  telemetry.trackCliOptionProject(project);
  telemetry.trackCliOptionSince(since);
  telemetry.trackCliOptionUntil(until);
  telemetry.trackCliOptionProvider(provider);
  telemetry.trackCliOptionModel(model);
  telemetry.trackCliOptionStatus(status);
  telemetry.trackCliOptionPage(opts['--page']);
  telemetry.trackCliOptionLimit(opts['--limit']);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  if (!Number.isInteger(page) || page < 1) {
    output.error('Page must be an integer greater than 0.');
    return 1;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    output.error(`Limit must be an integer from 1 to ${MAX_LIMIT}.`);
    return 1;
  }
  if (status && !/^(?:[1-5]xx|\d{3})$/.test(status)) {
    output.error('Status must be an HTTP code or class, such as 200 or 5xx.');
    return 1;
  }

  let timeRange;
  try {
    timeRange = resolveTimeRange(since || '1h', until);
  } catch (error) {
    output.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  if (timeRange.startTime >= timeRange.endTime) {
    output.error('The --since time must be before --until.');
    return 1;
  }

  let context;
  try {
    context = await resolveLogsContext(client);
  } catch (error) {
    if (isAPIError(error)) {
      output.error(error.message);
      return 1;
    }
    throw error;
  }
  if (!context) return 1;

  // Resolve the project after the team so lookup uses the same scope as the
  // request-log query.
  let projectId: string | undefined;
  if (project) {
    try {
      const resolved = await getProjectByNameOrId(client, project);
      if (resolved instanceof ProjectNotFound) {
        output.error(`Project not found: ${project}`);
        return 1;
      }
      projectId = resolved.id;
    } catch (error) {
      if (isAPIError(error)) {
        output.error(error.message);
        return 1;
      }
      throw error;
    }
  }

  output.spinner('Fetching AI Gateway logs…');
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
      page,
      limit,
    });
  } catch (error) {
    output.stopSpinner();
    if (isAPIError(error)) {
      output.error(error.message);
      return 1;
    }
    throw error;
  }
  output.stopSpinner();

  const hasMore = result.returned === limit;
  const response = {
    requests: result.logs,
    pagination: { page, limit, returned: result.returned, hasMore },
  };
  if (formatResult.jsonOutput) {
    client.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    return 0;
  }

  if (result.logs.length === 0) {
    const filtered = Boolean(
      project || provider || model || status || since || until
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
