import type Client from '../../util/client';
import type { Aggregation } from '@vercel/o11y-tools/query-engine/types';

export interface DimensionSchema {
  name: string;
  label: string;
}

export interface MeasureSchema {
  name: string;
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

export function toApiEventName(cliName: string): string {
  return EVENT_ALIASES[cliName] ?? cliName;
}

export function toCliEventName(apiName: string): string {
  return REVERSE_ALIASES[apiName] ?? apiName;
}

function toMeasureSchema(
  measure: SchemaDetailResponse['measures'][number]
): MeasureSchema {
  return {
    name: measure.name,
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
        dimensions: detail.dimensions.map(dimension => ({
          name: dimension.name,
          label: dimension.label,
        })),
        measures: detail.measures.map(toMeasureSchema),
      };

      const queryEngineEvent = toApiEventName(cliEventName);
      if (queryEngineEvent !== cliEventName) {
        schema.queryEngineEvent = queryEngineEvent;
      }

      return [cliEventName, schema] as const;
    })
  );

  return Object.fromEntries(details);
}
