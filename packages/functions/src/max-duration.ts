import { getContext } from './get-context';

/**
 * Returns the resolved maximum duration for the current function invocation,
 * in seconds.
 */
export function getMaxDuration(): number | undefined {
  return getContext().maxDuration;
}
