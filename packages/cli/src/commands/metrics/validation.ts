import type { ValidationResult, ValidatedResult } from './types';
import {
  getEventNames,
  getEvent,
  getMeasures,
  getAggregations,
  getDimensions,
} from './schema-data';

export function validateEvent(event: string): ValidationResult {
  if (getEvent(event)) {
    return { valid: true };
  }
  return {
    valid: false,
    code: 'UNKNOWN_EVENT',
    message: `Unknown event "${event}".`,
    allowedValues: getEventNames(),
  };
}

export function validateMeasure(
  event: string,
  measure: string
): ValidationResult {
  const measures = getMeasures(event);
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
  event: string,
  measure: string,
  aggregation: string
): ValidationResult {
  const aggs = getAggregations(event, measure);
  if (aggs.includes(aggregation)) {
    return { valid: true };
  }
  return {
    valid: false,
    code: 'INVALID_AGGREGATION',
    message: `Aggregation "${aggregation}" is not valid for measure "${measure}" on event "${event}".`,
    allowedValues: [...aggs],
  };
}

export function validateGroupBy(
  event: string,
  dims: string[]
): ValidationResult {
  const dimensions = getDimensions(event);
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
    if (found.filterOnly) {
      return {
        valid: false,
        code: 'FILTER_ONLY_DIMENSION',
        message:
          `Dimension "${dim}" on event "${event}" is filter-only and cannot be used in --group-by.\n` +
          `Use it with --filter instead: --filter "${dim} eq '<value>'"`,
      };
    }
  }
  return { valid: true };
}

export function validateMutualExclusivity(
  all: boolean | undefined,
  project: string | undefined
): ValidationResult {
  if (all && project) {
    return {
      valid: false,
      code: 'MUTUAL_EXCLUSIVITY',
      message: 'Cannot specify both --all and --project. Use one or the other.',
    };
  }
  return { valid: true };
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
