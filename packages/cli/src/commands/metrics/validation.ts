import type { ValidationResult, ValidatedResult } from './types';
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
