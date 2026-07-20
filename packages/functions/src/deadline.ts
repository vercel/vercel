import { getContext } from './get-context';

/**
 * Returns the shared invocation deadline for the current function invocation,
 * as an RFC 3339 / ISO-8601 timestamp.
 */
export function getDeadline(): string | undefined {
  return getContext().deadline;
}
