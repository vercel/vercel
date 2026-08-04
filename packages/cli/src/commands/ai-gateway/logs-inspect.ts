import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { isAPIError } from '../../util/errors-ts';
import { logsInspectSubcommand } from './command';
import {
  fetchLog,
  fetchProviderAttempts,
  isValidGenerationId,
  resolveLogsContext,
} from './logs-api';
import { renderAttemptsTable, renderLogDetails } from './logs-format';
import { AiGatewayLogsInspectTelemetryClient } from '../../util/telemetry/commands/ai-gateway/logs-inspect';

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
    printError(error);
    return 1;
  }
  const { flags: opts, args } = parsedArgs;
  const generationId = args[0];
  telemetry.trackCliArgumentGenerationId(generationId);
  telemetry.trackCliOptionFormat(opts['--format']);

  if (!generationId) {
    output.error('Specify a Generation ID.');
    return 1;
  }
  if (!isValidGenerationId(generationId)) {
    output.error(
      'Generation ID must be `gen_` followed by a 26-character ULID.'
    );
    return 1;
  }
  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
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

  output.spinner('Fetching AI Gateway request…');
  let request;
  let attempts;
  try {
    [request, attempts] = await Promise.all([
      fetchLog(client, context, generationId),
      fetchProviderAttempts(client, context, generationId),
    ]);
  } catch (error) {
    output.stopSpinner();
    if (isAPIError(error)) {
      output.error(error.message);
      return 1;
    }
    throw error;
  }
  output.stopSpinner();

  if (!request) {
    output.error(
      `Request not found: ${generationId}. It may be outside retention or belong to another team.`
    );
    return 1;
  }

  if (formatResult.jsonOutput) {
    client.stdout.write(`${JSON.stringify({ request, attempts }, null, 2)}\n`);
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
