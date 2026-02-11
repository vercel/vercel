import { EVENTS, getDimensions, getMeasures, getMeasure } from './schema-data';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  suggestions?: string[];
}

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find similar strings using Levenshtein distance.
 */
function findSimilar(
  input: string,
  candidates: string[],
  maxDistance = 3
): string[] {
  const scored = candidates
    .map(c => ({
      name: c,
      distance: levenshteinDistance(input.toLowerCase(), c.toLowerCase()),
    }))
    .filter(c => c.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);

  return scored.slice(0, 3).map(c => c.name);
}

/**
 * Validate that an event name exists.
 */
export function validateEvent(event: string): ValidationResult {
  const eventNames = EVENTS.map(e => e.name);

  if (eventNames.includes(event)) {
    return { valid: true };
  }

  const suggestions = findSimilar(event, eventNames);

  return {
    valid: false,
    error: `Unknown event "${event}".`,
    suggestions,
  };
}

/**
 * Validate that a dimension is available for the given event.
 */
export function validateDimension(
  event: string,
  dimension: string
): ValidationResult {
  const dimensions = getDimensions(event);
  const dimensionNames = dimensions.map(d => d.name);

  if (dimensionNames.includes(dimension)) {
    return { valid: true };
  }

  const suggestions = findSimilar(dimension, dimensionNames);

  return {
    valid: false,
    error: `Dimension "${dimension}" is not available for event "${event}".`,
    suggestions,
  };
}

/**
 * Validate that a measure is available for the given event.
 */
export function validateMeasure(
  event: string,
  measure: string
): ValidationResult {
  const measures = getMeasures(event);
  const measureNames = measures.map(m => m.name);

  if (measureNames.includes(measure)) {
    return { valid: true };
  }

  const suggestions = findSimilar(measure, measureNames);

  return {
    valid: false,
    error: `Measure "${measure}" is not available for event "${event}".`,
    suggestions,
  };
}

/**
 * Validate that an aggregation is valid for the given measure.
 */
export function validateAggregation(
  event: string,
  measure: string,
  aggregation: string
): ValidationResult {
  const measureDef = getMeasure(event, measure);

  if (!measureDef) {
    return {
      valid: false,
      error: `Measure "${measure}" is not available for event "${event}".`,
    };
  }

  if (measureDef.aggregations.includes(aggregation)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Aggregation "${aggregation}" is not valid for measure "${measure}".`,
    suggestions: measureDef.aggregations,
  };
}

/**
 * Format validation error with suggestions.
 */
export function formatValidationError(result: ValidationResult): string {
  let message = result.error ?? 'Validation error.';

  if (result.suggestions && result.suggestions.length > 0) {
    message += `\n\nDid you mean: ${result.suggestions.join(', ')}?`;
  }

  return message;
}
