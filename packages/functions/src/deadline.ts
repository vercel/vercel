import { getContext } from './get-context';

/**
 * Returns the shared invocation deadline for the
 * current function invocation, as a Date object.
 */
export function getDeadline(): Date | undefined {
  const deadline = getContext().deadline;
  if (deadline === undefined) {
    return undefined;
  }
  const date = new Date(deadline);
  if (isNaN(date.getTime())) {
    return undefined;
  }
  return date;
}
