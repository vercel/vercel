export const FLAG_EVALUATIONS_GRANULARITIES = [
  '1m',
  '5m',
  '15m',
  '1h',
  '4h',
  '1d',
] as const;

export type FlagEvaluationsGranularity =
  (typeof FLAG_EVALUATIONS_GRANULARITIES)[number];

export function isFlagEvaluationsGranularity(
  value: string
): value is FlagEvaluationsGranularity {
  return FLAG_EVALUATIONS_GRANULARITIES.some(
    granularity => granularity === value
  );
}

export const FLAG_EVALUATIONS_DIMENSIONS = {
  variant: { field: 'flagVariant', heading: 'Variants' },
  flag: { field: 'flagKey', heading: 'Flags' },
  'sdk-key': { field: 'sdkKeyId', heading: 'SDK Keys' },
  client: { field: 'flagClientName', heading: 'Clients' },
  environment: { field: 'environment', heading: 'Environments' },
  reason: { field: 'flagEvaluationReason', heading: 'Reasons' },
  'datafile-revision': {
    field: 'datafileRevision',
    heading: 'Datafile Revisions',
  },
} as const;

export type FlagEvaluationsDimension = keyof typeof FLAG_EVALUATIONS_DIMENSIONS;

export const FLAG_EVALUATIONS_DIMENSION_NAMES = Object.keys(
  FLAG_EVALUATIONS_DIMENSIONS
) as FlagEvaluationsDimension[];

export function isFlagEvaluationsDimension(
  value: string
): value is FlagEvaluationsDimension {
  return (FLAG_EVALUATIONS_DIMENSION_NAMES as string[]).includes(value);
}
