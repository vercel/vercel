import type Client from '../../util/client';
import type {
  EventSchema,
  MeasureSchema,
  MetricsAggregation,
  Schema,
} from './schema-data';

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
    canGroupBy: boolean;
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
    aggregations: measure.aggregations as MetricsAggregation[],
    defaultAggregation: measure.defaultAggregation as MetricsAggregation,
  };
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
          filterOnly: !dimension.canGroupBy,
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
