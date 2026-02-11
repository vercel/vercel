import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import table from '../../util/output/table';
import { EVENTS, getEvent, getDimensions, getMeasures } from './schema-data';
import { validateEvent, formatValidationError } from './validation';

interface SchemaFlags {
  '--event'?: string;
  '--json'?: boolean;
}

export default async function schema(
  client: Client,
  flags: SchemaFlags
): Promise<number> {
  const eventName = flags['--event'];
  const asJson = flags['--json'];

  if (eventName) {
    return showEventSchema(client, eventName, asJson);
  }

  return showAllEvents(client, asJson);
}

function showAllEvents(client: Client, asJson?: boolean): number {
  if (asJson) {
    output.stopSpinner();
    client.stdout.write(JSON.stringify({ events: EVENTS }, null, 2) + '\n');
    return 0;
  }

  output.print(chalk.bold('Available Events:\n\n'));

  const rows = EVENTS.map(event => [
    chalk.cyan(event.name),
    chalk.dim(event.label),
  ]);

  output.print(table(rows, { hsep: 4 }) + '\n\n');
  output.print(
    chalk.dim(
      "Use 'vercel metrics schema -e <event>' to see dimensions and measures.\n"
    )
  );

  return 0;
}

function showEventSchema(
  client: Client,
  eventName: string,
  asJson?: boolean
): number {
  const validation = validateEvent(eventName);
  if (!validation.valid) {
    output.error(formatValidationError(validation));
    output.print('\n');
    showAllEvents(client, false);
    return 1;
  }

  const event = getEvent(eventName)!;
  const dimensions = getDimensions(eventName);
  const measures = getMeasures(eventName);

  if (asJson) {
    output.stopSpinner();
    client.stdout.write(
      JSON.stringify(
        {
          event: event.name,
          label: event.label,
          dimensions,
          measures,
        },
        null,
        2
      ) + '\n'
    );
    return 0;
  }

  output.print(
    chalk.bold(`Event: ${chalk.cyan(event.name)} (${event.label})\n\n`)
  );

  // Dimensions
  output.print(chalk.bold('Dimensions (--by):\n'));

  const dimensionRows = dimensions.map(d => [
    chalk.cyan(d.name),
    d.label,
    d.highCardinality ? chalk.dim('(high cardinality)') : '',
  ]);

  output.print(table(dimensionRows, { hsep: 2 }) + '\n\n');

  // Measures
  output.print(chalk.bold('Measures (--measure):\n'));

  const measureRows = measures.map(m => [
    chalk.cyan(m.name),
    m.label,
    chalk.dim(`[${m.aggregations.join(', ')}]`),
  ]);

  output.print(table(measureRows, { hsep: 2 }) + '\n\n');

  // Example queries
  output.print(chalk.bold('Example queries:\n\n'));
  output.print(
    chalk.dim(`  # Count by error code in last hour
  vercel metrics -e ${eventName} --by errorCode --since 1h

  # P95 latency by route
  vercel metrics -e ${eventName} -m ${measures[1]?.name ?? 'count'} -a p95 --by route --since 24h
\n`)
  );

  return 0;
}
