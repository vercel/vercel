import { z } from 'zod';

/**
 * CLI-owned continuation tokens for the observability events API.
 *
 * The API binds a cursor to the request identity: event, owner, project IDs,
 * time range, filter, and order. It rejects a cursor sent with any other
 * request. The token carries that identity next to the opaque API cursor, so
 * a later invocation can rebuild the exact request from the token alone. Page
 * size and selected fields are not part of the identity and may change.
 *
 * Tokens are base64url-encoded JSON. They are not credentials: the API still
 * authorizes the owner on every request.
 */

const CONTINUATION_VERSION = 1;

const continuationSchema = z.object({
  v: z.literal(CONTINUATION_VERSION),
  event: z.string().min(1),
  ownerId: z.string().min(1),
  projectIds: z.array(z.string().min(1)).optional(),
  timeRange: z.object({
    start: z.string().min(1),
    end: z.string().min(1),
  }),
  filter: z.string().optional(),
  order: z.enum(['asc', 'desc']),
  cursor: z.string().min(1),
});

export type EventsContinuation = Omit<z.infer<typeof continuationSchema>, 'v'>;

export function encodeContinuation(continuation: EventsContinuation): string {
  const payload: z.infer<typeof continuationSchema> = {
    v: CONTINUATION_VERSION,
    event: continuation.event,
    ownerId: continuation.ownerId,
    ...(continuation.projectIds
      ? { projectIds: [...continuation.projectIds] }
      : {}),
    timeRange: {
      start: continuation.timeRange.start,
      end: continuation.timeRange.end,
    },
    ...(continuation.filter !== undefined
      ? { filter: continuation.filter }
      : {}),
    order: continuation.order,
    cursor: continuation.cursor,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** Returns the decoded continuation, or `undefined` for any malformed token. */
export function decodeContinuation(
  token: string
): EventsContinuation | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    return undefined;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
  const parsed = continuationSchema.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }
  const { v: _version, ...continuation } = parsed.data;
  return continuation;
}
