import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { logsInspectSubcommand } from './command';
import {
  fetchLog,
  fetchProviderAttempts,
  isValidGenerationId,
  resolveLogsContext,
} from './logs-api';
import { renderAttemptsTable, renderLogDetails } from './logs-format';
import {
  argvRequestsLogsJson,
  outputLogsApiError,
  outputLogsError,
  outputMissingLogsTeam,
  shouldUseLogsJson,
} from './logs-output';
import { AiGatewayLogsInspectTelemetryClient } from '../../util/telemetry/commands/ai-gateway/logs-inspect';
import { AGENT_REASON } from '../../util/agent-output-constants';

export default async function inspect(client: Client, argv: string[]) {
  const telemetry = new AiGatewayLogsInspectTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const flagsSpecification = getFlagsSpecification(
    logsInspectSubcommand.options
  );
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
  const { flags: opts, args } = parsedArgs;
  const generationId = args[0];
  telemetry.trackCliArgumentGenerationId(generationId);
  telemetry.trackCliOptionFormat(opts['--format']);
  telemetry.trackCliFlagJson(opts['--json']);

  const requestedJson =
    opts['--json'] === true || opts['--format']?.toLowerCase() === 'json';
  const jsonOutput = shouldUseLogsJson(client, requestedJson);

  if (!generationId) {
    return outputLogsError(
      client,
      {
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: 'Specify a Generation ID.',
        next: [
          {
            command:
              'vercel ai-gateway logs inspect <generationId> --scope <team-slug> --json',
          },
        ],
      },
      jsonOutput
    );
  }
  if (!isValidGenerationId(generationId)) {
    return outputLogsError(
      client,
      {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message:
          'Generation ID must be `gen_` followed by a 26-character ULID.',
      },
      jsonOutput
    );
  }
  const formatResult = validateJsonOutput(opts);
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

  if (!client.config.currentTeam && jsonOutput) {
    return outputMissingLogsTeam(client, 'inspect');
  }

  let context;
  try {
    context = await resolveLogsContext(client);
  } catch (error) {
    return outputLogsApiError(
      client,
      error,
      jsonOutput,
      `vercel ai-gateway logs inspect ${generationId} --scope <team-slug> --json`
    );
  }
  if (!context) return 1;

  if (!jsonOutput) output.spinner('Fetching AI Gateway request…');
  let request;
  let attempts;
  try {
    [request, attempts] = await Promise.all([
      fetchLog(client, context, generationId),
      fetchProviderAttempts(client, context, generationId),
    ]);
  } catch (error) {
    if (!jsonOutput) output.stopSpinner();
    return outputLogsApiError(
      client,
      error,
      jsonOutput,
      `vercel ai-gateway logs inspect ${generationId} --scope <team-slug> --json`
    );
  }
  if (!jsonOutput) output.stopSpinner();

  if (!request) {
    return outputLogsError(
      client,
      {
        reason: AGENT_REASON.NOT_FOUND,
        message: `Request not found: ${generationId}. It may be outside retention or belong to another team.`,
        next: [
          {
            command:
              'vercel ai-gateway logs list --scope <team-slug> --search <generationId> --json',
            when: 'Search for the request under another team or time range',
          },
        ],
      },
      jsonOutput
    );
  }

  if (jsonOutput) {
    client.stdout.write(
      `${JSON.stringify(
        {
          status: 'success',
          reason: 'ai_gateway_log_inspected',
          message: 'Loaded AI Gateway request details.',
          data: {
            team: { id: context.teamId, slug: context.teamSlug },
            request,
            attempts,
          },
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.log('Request');
  client.stdout.write(renderLogDetails(request));
  if (attempts.length === 0) {
    output.log('No provider attempts found.');
    return 0;
  }
  output.log('Provider attempts · failures first');
  client.stdout.write(renderAttemptsTable(attempts));
  return 0;
}
