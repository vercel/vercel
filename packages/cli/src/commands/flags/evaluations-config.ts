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
