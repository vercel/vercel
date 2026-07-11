import type {
  OrderBy,
  OrderDirection,
  ValidationResult,
  ValidatedResult,
} from './types';
import { validateAllProjectMutualExclusivity } from '../../util/command-validation';

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
      "Missing required metric. Specify the metric to query.\n\nRun 'vercel metrics schema' to see available metrics.",
  };
}

export function validateOrderDirection(
  orderDirection: string | undefined
): ValidatedResult<OrderDirection | undefined> {
  if (orderDirection === undefined) {
    return { valid: true, value: undefined };
  }

  if (orderDirection === 'asc' || orderDirection === 'desc') {
    return { valid: true, value: orderDirection };
  }

  return {
    valid: false,
    code: 'INVALID_ORDER',
    message: `Invalid order "${orderDirection}". Use "asc" or "desc".`,
    allowedValues: ['asc', 'desc'],
  };
}

export function validateOrderBy(
  orderBy: string | undefined
): ValidatedResult<OrderBy | undefined> {
  if (orderBy === undefined) {
    return { valid: true, value: undefined };
  }

  if (orderBy === 'value' || orderBy === 'count') {
    return { valid: true, value: orderBy };
  }

  return {
    valid: false,
    code: 'INVALID_ORDER_BY',
    message: `Invalid order-by "${orderBy}". Use "value" or "count".`,
    allowedValues: ['value', 'count'],
  };
}
