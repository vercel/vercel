import type { IncomingMessage, ServerResponse } from 'http';
import rawBody from 'raw-body';
import { z } from 'zod';
import {
  ScheduleBrokerError,
  type ScheduleBroker,
} from '@vercel-internals/local-schedules';

// HTTP shapes follow api/apps/vss-server's /v1/schedules routes. Timing,
// registry state, dispatch envelopes, and cursors belong to the core broker.
const identifier = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[0-9A-Za-z][0-9A-Za-z._-]*$/, {
    message:
      'Expected an identifier starting with a letter or number and containing only letters, numbers, and . _ -',
  });
const definition = z.strictObject({
  expression: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('cron'), cron: z.string().min(1) }),
    z.strictObject({ type: z.literal('single'), at: z.string().min(1) }),
  ]),
  timezone: z.string().min(1).max(50).optional(),
  jitter: z.number().int().min(1).max(15).optional(),
  target: z.strictObject({
    type: z.literal('queue'),
    topic: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9_-]+$/),
  }),
  payload: z.unknown().optional(),
});
const createBody = definition.extend({
  name: identifier.optional(),
  namespace: identifier.optional(),
});
const updateBody = definition.partial().extend({
  jitter: definition.shape.jitter.nullable(),
});
const scopeQuery = z.object({ projectId: z.string().min(1).optional() });
const identifierQuery = scopeQuery.extend({ namespace: identifier.optional() });
const listQuery = identifierQuery.extend({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const enableBody = z.strictObject({
  until: z.number().int().positive().optional(),
});
// Matches @api/schedules MAX_SCHEDULE_PAYLOAD_BYTES.
const MAX_PAYLOAD_BYTES = 8 * 1024;
const MAX_BODY_BYTES = MAX_PAYLOAD_BYTES + 16 * 1024;

// Status and code of the hosted API's response for each broker error.
const BROKER_ERRORS: Record<
  ScheduleBrokerError['code'],
  [status: number, code: string]
> = {
  invalid_request: [400, 'bad_request'],
  invalid_cron_expression: [400, 'invalid_cron_expression'],
  jitter_exceeds_cadence: [400, 'jitter_exceeds_cadence'],
  single_at_in_past: [400, 'single_at_in_past'],
  active_until_in_past: [400, 'active_until_in_past'],
  not_found: [404, 'not_found'],
  conflict: [409, 'schedule_already_exists'],
  static_schedule: [409, 'static_schedule'],
  schedule_type_change_not_allowed: [409, 'schedule_type_change_not_allowed'],
  schedule_single_at_passed: [409, 'schedule_single_at_passed'],
  schedule_already_active: [409, 'schedule_already_active'],
  closed: [503, 'unavailable'],
};

export async function handleSchedulesRequest(
  broker: ScheduleBroker,
  projectId: string,
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<void> {
  const send = (status: number, data: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  const error = (status: number, code: string, message: string) =>
    send(status, { error: { code, message } });

  try {
    const route =
      /^\/v1\/schedules(?:\/([^/]+)(?:\/(enable|disable|invoke))?)?$/.exec(
        pathname
      );
    if (!route) {
      error(404, 'not_found', 'Schedule route not found');
      return;
    }
    const [, encodedName, action] = route;
    const methods = action
      ? ['POST']
      : encodedName
        ? ['GET', 'PATCH', 'DELETE']
        : ['GET', 'POST'];
    if (!methods.includes(req.method || '')) {
      res.setHeader('Allow', methods.join(', '));
      error(405, 'method_not_allowed', 'Method not allowed');
      return;
    }
    const query = Object.fromEntries(
      new URL(req.url || '/', 'http://localhost').searchParams
    );
    const parsedQuery = (
      !encodedName && req.method === 'POST' ? scopeQuery : identifierQuery
    ).parse(query);
    if (
      parsedQuery.projectId !== undefined &&
      parsedQuery.projectId !== projectId
    ) {
      throw new ScheduleBrokerError(
        'invalid_request',
        'The projectId query parameter must match the local project.'
      );
    }

    if (!encodedName && req.method === 'GET') {
      const { namespace, cursor, limit } = listQuery.parse(query);
      send(200, broker.list({ namespace, cursor, limit }));
      return;
    }

    // Sends the error response and returns undefined when the body is unreadable.
    const readBody = async (): Promise<string | undefined> => {
      try {
        return await rawBody(req, { limit: MAX_BODY_BYTES, encoding: 'utf8' });
      } catch (err) {
        const tooLarge = (err as { statusCode?: number }).statusCode === 413;
        error(
          tooLarge ? 413 : 400,
          tooLarge ? 'payload_too_large' : 'bad_request',
          tooLarge
            ? `Schedule request exceeds ${MAX_BODY_BYTES} bytes`
            : 'Could not read the request body'
        );
        return undefined;
      }
    };

    if (req.method === 'PATCH' || (!encodedName && req.method === 'POST')) {
      const text = await readBody();
      if (text === undefined) return;
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        error(400, 'bad_request', 'Expected a JSON object as the request body');
        return;
      }
      const parsed = (req.method === 'PATCH' ? updateBody : createBody).parse(
        body
      );
      const payloadBytes =
        parsed.payload === undefined || parsed.payload === null
          ? 0
          : Buffer.byteLength(JSON.stringify(parsed.payload) ?? '');
      if (payloadBytes > MAX_PAYLOAD_BYTES) {
        error(
          400,
          'payload_too_large',
          `Schedule payload exceeds maximum size of ${MAX_PAYLOAD_BYTES} bytes (got ${payloadBytes})`
        );
        return;
      }
      if (!encodedName) {
        send(201, broker.create(createBody.parse(parsed)));
      } else {
        send(
          200,
          broker.update(
            {
              name: identifier.parse(decodeURIComponent(encodedName)),
              namespace: identifierQuery.parse(query).namespace,
            },
            parsed
          )
        );
      }
      return;
    }

    const id = {
      name: identifier.parse(decodeURIComponent(encodedName)),
      namespace: identifierQuery.parse(query).namespace,
    };
    if (action === 'invoke') {
      await broker.invoke(id);
      res.writeHead(204);
      res.end();
    } else if (action === 'enable') {
      // Enabling has always been a bodyless POST; `until` is optional.
      const text = await readBody();
      if (text === undefined) return;
      let json: unknown = {};
      if (text.trim() !== '') {
        try {
          json = JSON.parse(text);
        } catch {
          error(400, 'bad_request', 'Invalid JSON in request body');
          return;
        }
      }
      send(200, broker.enable(id, enableBody.parse(json)));
    } else if (action === 'disable') {
      send(200, broker.disable(id));
    } else if (req.method === 'DELETE') {
      send(200, broker.delete(id));
    } else {
      send(200, broker.get(id));
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      error(
        400,
        'bad_request',
        err.issues
          .map(
            issue => `${issue.path.join('.') || 'request'}: ${issue.message}`
          )
          .join('; ')
      );
    } else if (err instanceof URIError) {
      error(400, 'bad_request', 'Invalid encoded schedule name');
    } else if (err instanceof ScheduleBrokerError) {
      const [status, code] = BROKER_ERRORS[err.code];
      error(status, code, err.message);
    } else {
      // Dispatch failures are local operational errors, not malformed input.
      error(
        500,
        'schedule_dispatch_failed',
        err instanceof Error ? err.message : 'Failed to dispatch schedule'
      );
    }
  }
}
