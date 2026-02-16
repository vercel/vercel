import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { schemaSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import { validateEvent } from './validation';
import {
  getEventNames,
  getEvent,
  getAggregations,
  SCHEMA,
} from './schema-data';
import {
  formatSchemaListCsv,
  formatSchemaListJson,
  formatSchemaDetailCsv,
  formatSchemaDetailJson,
  formatErrorJson,
} from './output';
import type { MetricsTelemetryClient } from '../../util/telemetry/commands/metrics';

export default async function schema(
  client: Client,
  telemetry: MetricsTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(schemaSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const flags = parsedArgs.flags;

  // Validate output format
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;

  const event = flags['--event'] as string | undefined;
  telemetry.trackCliOptionEvent(event);
  telemetry.trackCliOptionFormat(flags['--format'] as string | undefined);

  if (event) {
    // Event detail
    const eventResult = validateEvent(event);
    if (!eventResult.valid) {
      if (jsonOutput) {
        client.stdout.write(
          formatErrorJson(
            eventResult.code,
            eventResult.message,
            eventResult.allowedValues
          )
        );
      } else {
        output.error(eventResult.message);
        if (eventResult.allowedValues) {
          output.print(
            `\nAvailable events: ${eventResult.allowedValues.join(', ')}\n`
          );
        }
      }
      return 1;
    }

    const eventData = getEvent(event)!;
    const eventWithName = { ...eventData, name: event };

    if (jsonOutput) {
      // For JSON, compute aggregations from the first non-count measure, or count
      const hasNonCount = eventData.measures.some(m => m.name !== 'count');
      const sampleMeasure = hasNonCount
        ? eventData.measures.find(m => m.name !== 'count')!.name
        : eventData.measures.length > 0
          ? 'count'
          : '';
      const aggregations = sampleMeasure
        ? getAggregations(event, sampleMeasure)
        : [];
      client.stdout.write(formatSchemaDetailJson(eventWithName, aggregations));
    } else {
      output.log(`Event: ${event} - ${eventData.description}`);
      client.stdout.write(formatSchemaDetailCsv(eventWithName));
    }
  } else {
    // Event list
    const events = getEventNames().map(name => ({
      name,
      description: SCHEMA[name].description,
    }));

    if (jsonOutput) {
      client.stdout.write(formatSchemaListJson(events));
    } else {
      client.stdout.write(formatSchemaListCsv(events));
    }
  }

  return 0;
}
