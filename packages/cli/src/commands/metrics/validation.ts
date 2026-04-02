import type {
  ValidationResult,
  ValidatedResult,
  MetricSchemaDetail,
} from './types';
import { validateAllProjectMutualExclusivity } from '../../util/command-validation';
import type { MetricListItem } from './schema-api';
import { getAggregations } from './schema-api';
import type { Aggregation } from './types';

export function validateMetric(
  metrics: MetricListItem[],
  metric: string
): ValidationResult {
  if (metrics.some(item => item.id === metric)) {
    return { valid: true };
  }
  return {
    valid: false,
    code: 'UNKNOWN_METRIC',
    message: `Unknown metric "${metric}".`,
    allowedValues: metrics.map(item => item.id),
  };
}

export function validateAggregation(
  detail: MetricSchemaDetail,
  aggregation: string
): ValidatedResult<Aggregation> {
  const aggs = getAggregations(detail, detail.id);
  const found = aggs.find(agg => agg === aggregation);
  if (found) {
    return { valid: true, value: found };
  }
  return {
    valid: false,
    code: 'INVALID_AGGREGATION',
    message: `Aggregation "${aggregation}" is not valid for metric "${detail.id}".`,
    allowedValues: [...aggs],
  };
}

export function validateGroupBy(
  detail: MetricSchemaDetail,
  dims: string[]
): ValidationResult {
  const dimensions = detail.dimensions;
  for (const dim of dims) {
    const found = dimensions.find(dimension => dimension.name === dim);
    if (!found) {
      return {
        valid: false,
        code: 'UNKNOWN_DIMENSION',
        message: `Dimension "${dim}" is not available for metric "${detail.id}".`,
        allowedValues: dimensions.map(dimension => dimension.name),
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

export function validateRequiredMetric(
  metric: string | undefined
): ValidatedResult<string> {
  if (metric) {
    return { valid: true, value: metric };
  }
  return {
    valid: false,
    code: 'MISSING_METRIC',
    message:
      "Missing required flag --metric. Specify the metric to query.\n\nRun 'vercel metrics schema' to see available metrics.",
  };
}
