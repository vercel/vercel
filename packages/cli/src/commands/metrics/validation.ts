import type { ValidationResult, ValidatedResult } from './types';
import type { Aggregation } from '@vercel/o11y-tools/query-engine/types';
import type { Schema } from './schema-api';
import { validateAllProjectMutualExclusivity } from '../../util/command-validation';
import {
  getEventNames,
  getEvent,
  getMeasures,
  getAggregations,
  getDimensions,
} from './schema-api';

export function validateEvent(schema: Schema, event: string): ValidationResult {
  if (getEvent(schema, event)) {
    return { valid: true };
  }
  return {
    valid: false,
    code: 'UNKNOWN_EVENT',
    message: `Unknown event "${event}".`,
    allowedValues: getEventNames(schema),
  };
}

export function validateMeasure(
  schema: Schema,
  event: string,
  measure: string
): ValidationResult {
  const measures = getMeasures(schema, event);
  if (measures.some(m => m.name === measure)) {
    return { valid: true };
  }
  return {
    valid: false,
    code: 'UNKNOWN_MEASURE',
    message: `Measure "${measure}" is not available for event "${event}".`,
    allowedValues: measures.map(m => m.name),
  };
}

export function validateAggregation(
  schema: Schema,
  event: string,
  measure: string,
  aggregation: string
): ValidatedResult<Aggregation> {
  const aggs = getAggregations(schema, event, measure);
  const found = aggs.find(agg => agg === aggregation);
  if (found) {
    return { valid: true, value: found };
  }
  return {
    valid: false,
    code: 'INVALID_AGGREGATION',
    message: `Aggregation "${aggregation}" is not valid for measure "${measure}" on event "${event}".`,
    allowedValues: [...aggs],
  };
}

export function validateGroupBy(
  schema: Schema,
  event: string,
  dims: string[]
): ValidationResult {
  const dimensions = getDimensions(schema, event);
  for (const dim of dims) {
    const found = dimensions.find(d => d.name === dim);
    if (!found) {
      return {
        valid: false,
        code: 'UNKNOWN_DIMENSION',
        message: `Dimension "${dim}" is not available for event "${event}".`,
        allowedValues: dimensions.map(d => d.name),
      };
    }
  }
  return { valid: true };
}

export function validateMutualExclusivity(
  all: boolean | undefined,
  project: string | undefined
): ValidationResult {
  return validateAllProjectMutualExclusivity(all, project);
}

export function validateRequiredEvent(
  event: string | undefined
): ValidatedResult<string> {
  if (event) {
    return { valid: true, value: event };
  }
  return {
    valid: false,
    code: 'MISSING_EVENT',
    message:
      "Missing required flag --event. Specify the event type to query.\n\nRun 'vercel metrics schema' to see available events.",
  };
}
