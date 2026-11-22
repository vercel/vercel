const RUN_ID_PREFIX = 'invo1_';
const RUN_ID_PATTERN = /^[A-Za-z0-9]+$/;

/**
 * Run IDs are shown without their internal `invo1_` prefix. Both forms are
 * accepted as input.
 */
export function toDisplayRunId(id: string): string {
  return id.startsWith(RUN_ID_PREFIX) ? id.slice(RUN_ID_PREFIX.length) : id;
}

/**
 * Returns the API form of a user-supplied run ID, or `null` when the value is
 * not a valid run ID.
 */
export function toApiRunId(input: string): string | null {
  const id = toDisplayRunId(input.trim());
  return RUN_ID_PATTERN.test(id) ? `${RUN_ID_PREFIX}${id}` : null;
}
