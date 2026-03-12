import chalk from 'chalk';
import plural from 'pluralize';
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
  type DimensionSchema,
  type MeasureSchema,
} from './schema-data';
import {
  formatSchemaListJson,
  formatSchemaDetailJson,
  formatErrorJson,
} from './output';
import formatTable from '../../util/format-table';
import indent from '../../util/output/indent';
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

  const event = flags['--event'];
  telemetry.trackCliOptionEvent(event);
  telemetry.trackCliOptionFormat(flags['--format']);

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

      const dimTable = formatDimensionsTable(eventWithName.dimensions);
      if (dimTable) {
        output.print(dimTable);
        output.print('\n');
      }

      const measTable = formatMeasuresTable(eventWithName.measures);
      if (measTable) {
        output.print(measTable);
        output.print('\n');
      }
    }
  } else {
    // Event list
    const events = getEventNames().map(name => ({
      name,
      description: getEvent(name)!.description,
    }));

    if (jsonOutput) {
      client.stdout.write(formatSchemaListJson(events));
    } else {
      output.log(`${plural('Event', events.length, true)} found`);
      output.print(formatEventsTable(events));
      output.print('\n');
    }
  }

  return 0;
}

function formatEventsTable(events: { name: string; description: string }[]) {
  return indent(
    formatTable(
      ['Event', 'Description'],
      ['l', 'l'],
      [{ rows: events.map(e => [e.name, e.description]) }]
    ),
    1
  );
}

function formatDimensionsTable(dimensions: DimensionSchema[]) {
  if (dimensions.length === 0) {
    return null;
  }
  return indent(
    formatTable(
      ['Dimension', 'Label', 'Groupable'],
      ['l', 'l', 'l'],
      [
        {
          rows: dimensions.map(d => [
            d.name,
            d.label,
            d.filterOnly ? chalk.dim('no') : 'yes',
          ]),
        },
      ]
    ),
    1
  );
}

function formatMeasuresTable(measures: MeasureSchema[]) {
  if (measures.length === 0) {
    return null;
  }
  return indent(
    formatTable(
      ['Measure', 'Label', 'Unit'],
      ['l', 'l', 'l'],
      [{ rows: measures.map(m => [m.name, m.label, m.unit]) }]
    ),
    1
  );
}
