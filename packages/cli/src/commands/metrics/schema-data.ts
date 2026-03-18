export interface DimensionSchema {
  name: string;
  label: string;
  filterOnly: boolean;
}

export type MetricsAggregation =
  | 'sum'
  | 'persecond'
  | 'percent'
  | 'avg'
  | 'min'
  | 'max'
  | 'p50'
  | 'p75'
  | 'p90'
  | 'p95'
  | 'p99'
  | 'stddev';

export interface MeasureSchema {
  name: string;
  label: string;
  unit: string;
  aggregations: MetricsAggregation[];
  defaultAggregation: MetricsAggregation;
}

export interface EventSchema {
  description: string;
  /** If set, this name is sent to the query engine instead of the schema key. */
  queryEngineEvent?: string;
  dimensions: DimensionSchema[];
  measures: MeasureSchema[];
}

export type Schema = Record<string, EventSchema>;
export type EventName = string;

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
): MetricsAggregation {
  const event = getEvent(schema, eventName);
  const measure = event?.measures.find(m => m.name === measureName);
  return measure?.defaultAggregation ?? 'sum';
}

export function getAggregations(
  schema: Schema,
  eventName: string,
  measureName: string
): readonly MetricsAggregation[] {
  const event = getEvent(schema, eventName);
  const measure = event?.measures.find(m => m.name === measureName);
  return measure?.aggregations ?? [];
}
