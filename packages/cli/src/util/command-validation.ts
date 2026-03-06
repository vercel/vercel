import { parseTimeFlag } from './time-utils';

export type ValidationError = {
  valid: false;
  code: string;
  message: string;
  allowedValues?: string[];
};

export type ValidationResult = { valid: true } | ValidationError;
export type ValidatedResult<T> = { valid: true; value: T } | ValidationError;

export function validateAllProjectMutualExclusivity(
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

export function validateTimeBound(
  input: string | undefined
): ValidatedResult<Date | undefined> {
  if (!input) {
    return { valid: true, value: undefined };
  }

  try {
    return { valid: true, value: parseTimeFlag(input) };
  } catch (err) {
    return {
      valid: false,
      code: 'INVALID_TIME',
      message: (err as Error).message,
    };
  }
}

export function validateTimeOrder(
  since: Date | undefined,
  until: Date | undefined
): ValidationResult {
  if (since && until && since.getTime() > until.getTime()) {
    return {
      valid: false,
      code: 'INVALID_TIME_RANGE',
      message: '`--since` must be earlier than `--until`.',
    };
  }
  return { valid: true };
}

export function normalizeRepeatableStringFilters(
  filters: string[] | undefined
): string[] {
  if (!filters || filters.length === 0) {
    return [];
  }

  const normalized = filters
    .flatMap(filter => filter.split(','))
    .map(filter => filter.trim())
    .filter(Boolean);

  return [...new Set(normalized)];
}

export function validateIntegerRangeWithDefault(
  value: number | undefined,
  opts: {
    flag: string;
    min: number;
    max: number;
    defaultValue: number;
  }
): ValidatedResult<number> {
  if (value === undefined) {
    return { valid: true, value: opts.defaultValue };
  }

  if (Number.isNaN(value)) {
    return {
      valid: false,
      code: 'INVALID_LIMIT',
      message: `Please provide a number for flag \`${opts.flag}\`.`,
    };
  }

  if (!Number.isInteger(value) || value < opts.min || value > opts.max) {
    return {
      valid: false,
      code: 'INVALID_LIMIT',
      message: `\`${opts.flag}\` must be an integer between ${opts.min} and ${opts.max}.`,
    };
  }

  return { valid: true, value };
}

export function validateOptionalIntegerRange(
  value: number | undefined,
  opts: {
    flag: string;
    min: number;
    max: number;
    code?: string;
  }
): ValidatedResult<number | undefined> {
  if (value === undefined) {
    return { valid: true, value: undefined };
  }

  if (Number.isNaN(value)) {
    return {
      valid: false,
      code: opts.code || 'INVALID_LIMIT',
      message: `Please provide a number for flag \`${opts.flag}\`.`,
    };
  }

  if (!Number.isInteger(value) || value < opts.min || value > opts.max) {
    return {
      valid: false,
      code: opts.code || 'INVALID_LIMIT',
      message: `\`${opts.flag}\` must be an integer between ${opts.min} and ${opts.max}.`,
    };
  }

  return { valid: true, value };
}
