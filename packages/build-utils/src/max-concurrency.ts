import assert from 'assert';

export const MAX_CONCURRENCY = 8192;

export function validateMaxConcurrency(value: number | undefined): void {
  if (value !== undefined) {
    assert(
      Number.isInteger(value) && value >= 1 && value <= MAX_CONCURRENCY,
      '"maxConcurrency" must be an integer from 1 to 8192'
    );
  }
}
