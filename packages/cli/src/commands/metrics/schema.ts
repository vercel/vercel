import plural from 'pluralize';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { schemaSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import { fetchSchema } from './schema-api';
import { validateEvent } from './validation';
import {
  getEventNames,
  getEvent,
  type DimensionSchema,
  type MeasureSchema,
} from './schema-api';
import {
  formatSchemaListJson,
  formatSchemaDetailJson,
  formatErrorJson,
} from './output';
import formatTable from '../../util/format-table';
import indent from '../../util/output/indent';
import type { MetricsTelemetryClient } from '../../util/telemetry/commands/metrics';
import getScope from '../../util/get-scope';
import { isAPIError } from '../../util/errors-ts';

function handleSchemaAuthError(client: Client, jsonOutput: boolean): number {
  const message =
    'The metrics schema API request was not authorized. Run `vercel login` to authenticate and `vercel switch` to select a team, then try again.';

  if (jsonOutput) {
    client.stdout.write(formatErrorJson('SCHEMA_UNAUTHORIZED', message));
  } else {
    output.error(message);
  }
  return 1;
}

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

  const { team } = await getScope(client);
  if (!team) {
    return handleSchemaAuthError(client, jsonOutput);
  }

  let schemaData;
  try {
    schemaData = await fetchSchema(client, team.id);
  } catch (err: unknown) {
    if (isAPIError(err) && (err.status === 401 || err.status === 403)) {
      return handleSchemaAuthError(client, jsonOutput);
    }
    const message =
      err instanceof Error
        ? `Failed to fetch metrics schema: ${err.message}`
        : `Failed to fetch metrics schema: ${String(err)}`;
    if (jsonOutput) {
      client.stdout.write(formatErrorJson('SCHEMA_FETCH_FAILED', message));
    } else {
      output.error(message);
    }
    return 1;
  }

  if (event) {
    // Event detail
    const eventResult = validateEvent(schemaData, event);
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

    const eventData = getEvent(schemaData, event)!;
    const eventWithName = { ...eventData, name: event };

    if (jsonOutput) {
      client.stdout.write(formatSchemaDetailJson(eventWithName));
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
    const events = getEventNames(schemaData).map(name => ({
      name,
      description: getEvent(schemaData, name)!.description,
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
      ['Dimension', 'Label'],
      ['l', 'l'],
      [
        {
          rows: dimensions.map(d => [d.name, d.label]),
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
      ['Measure', 'Label', 'Unit', 'Aggregations'],
      ['l', 'l', 'l', 'l'],
      [
        {
          rows: measures.map(m => [
            m.name,
            m.label,
            m.unit,
            m.aggregations.join(', '),
          ]),
        },
      ]
    ),
    1
  );
}
