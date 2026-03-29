import type Client from '../../util/client';
import output from '../../output-manager';
import { isAPIError } from '../../util/errors-ts';
import { formatErrorJson } from './output';
import type { Aggregation } from './types';

export interface DimensionSchema {
  name: string;
  apiName?: string;
  label: string;
}

export interface MeasureSchema {
  name: string;
  apiName?: string;
  label: string;
  unit: string;
  aggregations: Aggregation[];
  defaultAggregation: Aggregation;
}

export interface EventSchema {
  description: string;
  queryEngineEvent?: string;
  dimensions: DimensionSchema[];
  measures: MeasureSchema[];
}

export type Schema = Record<string, EventSchema>;

const EVENT_ALIASES: Record<string, string> = {
  edgeRequest: 'incomingRequest',
};

const REVERSE_ALIASES = Object.fromEntries(
  Object.entries(EVENT_ALIASES).map(([cli, api]) => [api, cli])
);

interface SchemaListResponse {
  events: Array<{
    name: string;
    description: string;
  }>;
}

interface SchemaDetailResponse {
  name: string;
  description: string;
  dimensions: Array<{
    name: string;
    label: string;
  }>;
  measures: Array<{
    name: string;
    label: string;
    unit: string;
    aggregations: string[];
    defaultAggregation: string;
  }>;
}

export function camelToSnakeCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

export function snakeToCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
}

export function toApiEventName(cliName: string): string {
  const withoutPrefix = cliName.replace(/^vercel\./, '');
  const camel = snakeToCamelCase(withoutPrefix);
  return EVENT_ALIASES[camel] ?? camel;
}

export function toCliEventName(apiName: string): string {
  const aliased = REVERSE_ALIASES[apiName] ?? apiName;
  return `vercel.${camelToSnakeCase(aliased)}`;
}

export function parseEventMeasure(input: string): {
  event: string;
  measure?: string;
} {
  const parts = input.split('.');
  if (parts.length >= 3 && parts[0] === 'vercel') {
    return {
      event: `${parts[0]}.${parts[1]}`,
      measure: parts.slice(2).join('.'),
    };
  }
  return { event: input };
}

function toMeasureSchema(
  measure: SchemaDetailResponse['measures'][number]
): MeasureSchema {
  const cliName = camelToSnakeCase(measure.name);
  return {
    name: cliName,
    ...(cliName !== measure.name ? { apiName: measure.name } : {}),
    label: measure.label,
    unit: measure.unit,
    aggregations: measure.aggregations as Aggregation[],
    defaultAggregation: measure.defaultAggregation as Aggregation,
  };
}

export function getEventNames(schema: Schema): string[] {
  return Object.keys(schema).sort();
}

export function getEvent(
  schema: Schema,
  name: string
): EventSchema | undefined {
  return schema[name];
}

export function getQueryEngineEventName(schema: Schema, name: string): string {
  const event = getEvent(schema, name);
  return event?.queryEngineEvent ?? name;
}

export function getDimensions(
  schema: Schema,
  eventName: string
): DimensionSchema[] {
  return getEvent(schema, eventName)?.dimensions ?? [];
}

export function getMeasures(
  schema: Schema,
  eventName: string
): MeasureSchema[] {
  return getEvent(schema, eventName)?.measures ?? [];
}

export function getDefaultAggregation(
  schema: Schema,
  eventName: string,
  measureName: string
): Aggregation {
  const event = getEvent(schema, eventName);
  const measure = event?.measures.find(m => m.name === measureName);
  return measure?.defaultAggregation ?? 'sum';
}

export function getAggregations(
  schema: Schema,
  eventName: string,
  measureName: string
): readonly Aggregation[] {
  const event = getEvent(schema, eventName);
  const measure = event?.measures.find(m => m.name === measureName);
  return measure?.aggregations ?? [];
}

export function getApiMeasureName(
  schema: Schema,
  eventName: string,
  cliMeasure: string
): string {
  const measure = getMeasures(schema, eventName).find(
    m => m.name === cliMeasure
  );
  return measure?.apiName ?? cliMeasure;
}

export function getApiDimensionName(
  schema: Schema,
  eventName: string,
  cliDimension: string
): string {
  const dimension = getDimensions(schema, eventName).find(
    d => d.name === cliDimension
  );
  return dimension?.apiName ?? cliDimension;
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierChar(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}

function findStringLiteralEnd(input: string, start: number): number {
  let index = start + 1;

  while (index < input.length) {
    if (input[index] !== "'") {
      index += 1;
      continue;
    }

    // OData escapes single quotes by doubling them.
    if (input[index + 1] === "'") {
      index += 2;
      continue;
    }

    return index + 1;
  }

  return -1;
}

export function convertFilterToApiNames(
  schema: Schema,
  eventName: string,
  filter: string
): string {
  // Avoid a plain replaceAll() here. Filters can contain quoted literals and
  // larger identifiers, so a blind string replacement would mutate values like
  // '/http_status' or names like 'route_identifier' instead of only rewriting
  // the actual dimension token.
  const apiNames = new Map(
    getDimensions(schema, eventName)
      .filter(d => d.apiName)
      .map(d => [d.name, d.apiName!])
  );

  if (apiNames.size === 0) {
    return filter;
  }

  let result = '';
  let index = 0;

  while (index < filter.length) {
    const char = filter[index];

    // Only rewrite confident identifier tokens. If the filter contains an
    // malformed string literal, leave it untouched and let the API validate it.
    if (char === "'") {
      const end = findStringLiteralEnd(filter, index);
      if (end === -1) {
        return filter;
      }
      result += filter.slice(index, end);
      index = end;
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = index;
      index += 1;
      while (index < filter.length && isIdentifierChar(filter[index])) {
        index += 1;
      }

      const identifier = filter.slice(start, index);
      result += apiNames.get(identifier) ?? identifier;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

export async function fetchSchema(
  client: Client,
  accountId: string
): Promise<Schema> {
  const { events } = await client.fetch<SchemaListResponse>(
    '/v1/observability/schema?source=cli',
    { accountId }
  );

  const details = await Promise.all(
    events.map(async event => {
      const detail = await client.fetch<SchemaDetailResponse>(
        `/v1/observability/schema/${encodeURIComponent(event.name)}`,
        { accountId }
      );

      const cliEventName = toCliEventName(detail.name);
      const schema: EventSchema = {
        description: detail.description,
        dimensions: detail.dimensions.map(dimension => {
          const cliName = camelToSnakeCase(dimension.name);
          return {
            name: cliName,
            ...(cliName !== dimension.name ? { apiName: dimension.name } : {}),
            label: dimension.label,
          };
        }),
        measures: detail.measures.map(toMeasureSchema),
      };

      if (detail.name !== cliEventName) {
        // Preserve the exact API event name from the schema response. Rebuilding
        // it from the CLI name can lose acronym casing like CPUUsage.
        schema.queryEngineEvent = detail.name;
      }

      return [cliEventName, schema] as const;
    })
  );

  return Object.fromEntries(details);
}

export async function fetchSchemaOrExit(
  client: Client,
  accountId: string,
  jsonOutput: boolean
): Promise<Schema | number> {
  try {
    return await fetchSchema(client, accountId);
  } catch (err: unknown) {
    if (isAPIError(err) && (err.status === 401 || err.status === 403)) {
      const message =
        'The metrics schema API request was not authorized. Run `vercel login` to authenticate and `vercel switch` to select a team, then try again.';

      if (jsonOutput) {
        client.stdout.write(formatErrorJson('SCHEMA_UNAUTHORIZED', message));
      } else {
        output.error(message);
      }
      return 1;
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
}
