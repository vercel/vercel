import { randomUUID } from 'crypto';
import { mkdtemp, realpath, rm } from 'fs/promises';
import {
  createServer,
  type IncomingHttpHeaders,
  type RequestListener,
  type Server,
} from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_RESOURCE_TOKEN } from '../../../../src/util/dev/resource-servers';
import {
  createLocalSchedulesSession,
  isLocalSchedulesOrigin,
  LOCAL_SCHEDULES_SESSION_HEADER,
  type LocalSchedulesSession,
} from '../../../../src/util/dev/schedules-session';
import { APIError } from '../../../../src/util/errors-ts';
import {
  getFetchDispatcher,
  setFetchDispatcher,
} from '../../../../src/util/fetch';
import {
  LocalSchedulesError,
  SCHEDULES_REQUEST_SOURCE_HEADER,
  SchedulesClient,
} from '../../../../src/util/schedules/client';
import { createLocalSchedulesClient } from '../../../../src/util/schedules/local-client';
import { client } from '../../../mocks/client';
import { createSchedule } from '../../../mocks/schedules';

const identifier = { name: 'daily/cleanup ?#', namespace: 'jobs & local' };
const schedule = createSchedule({ ...identifier, projectId: 'prj_local' });
const wireSchedule = { ...schedule, trackId: 'local' };
const schedulePath = `/v1/schedules/${encodeURIComponent(identifier.name)}`;
const expression = { type: 'cron' as const, cron: '0 2 * * *' };
const payload = { message: 'hello', nested: [1, true, null] };

interface Operation {
  name: string;
  run: (schedules: SchedulesClient) => Promise<unknown>;
  method: string;
  path: string;
  query: Record<string, string>;
  body?: unknown;
  response: unknown;
  expected: unknown;
  status?: number;
}

const operations: Operation[] = [
  {
    name: 'create',
    run: schedules =>
      schedules.create({
        ...identifier,
        expression,
        timezone: 'UTC',
        jitter: 0,
        target: { topic: 'cleanup' },
        payload,
      }),
    method: 'POST',
    path: '/v1/schedules',
    query: {},
    body: {
      ...identifier,
      expression,
      timezone: 'UTC',
      jitter: 0,
      target: { type: 'queue', topic: 'cleanup' },
      payload,
    },
    response: wireSchedule,
    expected: schedule,
  },
  {
    name: 'get',
    run: schedules => schedules.get(identifier),
    method: 'GET',
    path: schedulePath,
    query: { namespace: identifier.namespace },
    response: wireSchedule,
    expected: schedule,
  },
  {
    name: 'list',
    run: schedules =>
      schedules.list({
        namespace: identifier.namespace,
        cursor: 'cursor +/?=',
        limit: 5,
      }),
    method: 'GET',
    path: '/v1/schedules',
    query: {
      namespace: identifier.namespace,
      cursor: 'cursor +/?=',
      limit: '5',
    },
    response: { data: [wireSchedule], cursor: 'next_cursor' },
    expected: { data: [schedule], cursor: 'next_cursor' },
  },
  {
    name: 'update',
    run: schedules =>
      schedules.update({
        ...identifier,
        expression,
        timezone: 'America/New_York',
        jitter: null,
        target: { topic: 'updated' },
        payload,
      }),
    method: 'PATCH',
    path: schedulePath,
    query: { namespace: identifier.namespace },
    body: {
      expression,
      timezone: 'America/New_York',
      jitter: null,
      target: { type: 'queue', topic: 'updated' },
      payload,
    },
    response: wireSchedule,
    expected: schedule,
  },
  {
    name: 'delete',
    run: schedules => schedules.delete(identifier),
    method: 'DELETE',
    path: schedulePath,
    query: { namespace: identifier.namespace },
    response: { scheduleId: schedule.scheduleId },
    expected: { scheduleId: schedule.scheduleId },
  },
  ...(['enable', 'disable'] as const).map(name => ({
    name,
    run: (schedules: SchedulesClient) => schedules[name](identifier),
    method: 'POST',
    path: `${schedulePath}/${name}`,
    query: { namespace: identifier.namespace },
    response: wireSchedule,
    expected: schedule,
  })),
  {
    name: 'invoke',
    run: schedules => schedules.invoke(identifier),
    method: 'POST',
    path: `${schedulePath}/invoke`,
    query: { namespace: identifier.namespace },
    status: 204,
    response: undefined,
    expected: undefined,
  },
];

interface Reply {
  status?: number;
  body?: unknown;
  raw?: string;
  sessionId?: string | null;
  location?: string;
  drop?: boolean;
}

describe('local Schedules transport', () => {
  let originalCwd: string;
  let cwd: string;
  let session: LocalSchedulesSession;
  let dispose: () => Promise<void>;
  let infoReply: Reply;
  let operationReply: Reply;
  let servers: Server[];
  let allowedOrigins: Set<string>;
  let requests: {
    method: string | undefined;
    url: URL;
    headers: IncomingHttpHeaders;
    body: string;
  }[];
  let cloudFetch: ReturnType<typeof vi.spyOn>;
  let ensureAuthorized: ReturnType<typeof vi.spyOn>;
  let networkFetch: ReturnType<typeof vi.spyOn>;
  let dummyOrigin: string;
  let dummyRequests: ReturnType<
    typeof vi.fn<(url: string | undefined) => void>
  >;

  async function serve(handler: RequestListener): Promise<string> {
    const server = createServer(handler);
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected an ephemeral TCP listener');
    }
    const origin = `http://127.0.0.1:${address.port}`;
    allowedOrigins.add(origin);
    return origin;
  }

  beforeEach(async () => {
    originalCwd = process.cwd();
    servers = [];
    requests = [];
    allowedOrigins = new Set();
    cwd = await realpath(await mkdtemp(join(tmpdir(), 'vc-local-schedules-')));
    client.cwd = cwd;
    client.config.currentTeam = 'team_cloud';
    client.authConfig.token = 'cloud-client-token';
    cloudFetch = vi
      .spyOn(client, 'fetch')
      .mockRejectedValue(
        new Error('Local Schedules must not use client.fetch')
      );
    ensureAuthorized = vi
      .spyOn(
        client as unknown as { ensureAuthorized(): Promise<void> },
        'ensureAuthorized'
      )
      .mockRejectedValue(new Error('Local Schedules must not authorize cloud'));

    const fetch = globalThis.fetch;
    networkFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input)
        );
        // Keep real HTTP, but fail closed if a regression tries any other destination.
        if (!allowedOrigins.has(url.origin)) {
          throw new Error(`Unexpected network destination: ${url.origin}`);
        }
        return fetch(input, init);
      });
    dummyRequests = vi.fn();
    dummyOrigin = await serve((req, res) => {
      dummyRequests(req.url);
      res.writeHead(500).end();
    });
    vi.stubEnv('VERCEL_SCHEDULE_BASE_URL', `${dummyOrigin}/cloud`);
    vi.stubEnv('VERCEL_SCHEDULE_TOKEN', 'cloud-schedule-token');
    vi.stubEnv('VERCEL_TOKEN', 'cloud-env-token');
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'cloud-oidc-token');
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_cloud');
    operationReply = { body: wireSchedule };
    const origin = await serve((req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        const url = new URL(req.url!, session.origin);
        requests.push({
          method: req.method,
          url,
          headers: req.headers,
          body,
        });
        const reply = url.pathname === '/v1/info' ? infoReply : operationReply;
        if (reply.drop) {
          req.socket.destroy();
          return;
        }
        if (reply.sessionId !== null) {
          res.setHeader(
            LOCAL_SCHEDULES_SESSION_HEADER,
            reply.sessionId ?? session.id
          );
        }
        res.setHeader('content-type', 'application/json');
        res.setHeader('retry-after', '0');
        if (reply.location) res.setHeader('location', reply.location);
        res.statusCode = reply.status ?? 200;
        res.end(reply.raw ?? JSON.stringify(reply.body));
      });
    });
    ({ session, dispose } = await createLocalSchedulesSession(
      cwd,
      origin,
      'prj_local'
    ));
    infoReply = { body: session };
  });

  afterEach(async () => {
    try {
      expect(cloudFetch).not.toHaveBeenCalled();
      expect(ensureAuthorized).not.toHaveBeenCalled();
      expect(dummyRequests).not.toHaveBeenCalled();
      for (const request of requests) {
        expect(request.headers.authorization).toBe(
          `Bearer ${DEV_RESOURCE_TOKEN}`
        );
        expect(request.headers[LOCAL_SCHEDULES_SESSION_HEADER]).toBe(
          session.id
        );
        expect(request.headers[SCHEDULES_REQUEST_SOURCE_HEADER]).toBe('cli');
        expect(request.url.searchParams.has('ownerId')).toBe(false);
        expect(request.url.searchParams.has('teamId')).toBe(false);
        expect(request.url.searchParams.has('teamSlug')).toBe(false);
        if (request.url.pathname !== '/v1/info') {
          expect(request.url.searchParams.getAll('projectId')).toEqual([
            session.projectId,
          ]);
        }
      }
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      client.cwd = originalCwd;
      await Promise.all(
        servers.map(
          server =>
            new Promise<void>((resolve, reject) => {
              if (!server.listening) return resolve();
              server.close(error => (error ? reject(error) : resolve()));
              server.closeAllConnections();
            })
        )
      );
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('handshakes with the full descriptor and explicit local credentials', async () => {
    const schedules = await createLocalSchedulesClient(client);
    expect(schedules).toBeInstanceOf(SchedulesClient);
    expect(schedules.localOrigin).toBe(session.origin);
    expect(isLocalSchedulesOrigin(schedules.localOrigin)).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'GET', body: '' });
    expect(requests[0].url.href).toBe(`${session.origin}/v1/info`);
    expect(session).toEqual({
      version: 1,
      id: expect.any(String),
      pid: process.pid,
      cwd,
      origin: schedules.localOrigin,
      projectId: 'prj_local',
    });
  });

  it('uses the published fallback port directly, not cloud or proxy settings', async () => {
    const dispatcher = getFetchDispatcher();
    const dispatch = vi.fn(() => {
      throw new Error('Local requests must bypass the cloud proxy');
    });
    setFetchDispatcher({ dispatch });
    vi.stubEnv('HTTP_PROXY', dummyOrigin);
    vi.stubEnv('HTTPS_PROXY', dummyOrigin);
    try {
      const schedules = await createLocalSchedulesClient(client);
      await schedules.get(identifier);
      expect(requests.map(request => request.url.origin)).toEqual([
        session.origin,
        session.origin,
      ]);
      expect(session.origin).not.toBe(dummyOrigin);
      expect(dispatch).not.toHaveBeenCalled();
      expect(networkFetch).toHaveBeenCalledTimes(2);
    } finally {
      setFetchDispatcher(dispatcher);
    }
  });

  it('works without cloud authentication', async () => {
    client.authConfig = {};
    vi.stubEnv('VERCEL_TOKEN', undefined);
    vi.stubEnv('VERCEL_OIDC_TOKEN', undefined);
    const schedules = await createLocalSchedulesClient(client);
    await expect(schedules.get(identifier)).resolves.toEqual(schedule);
  });

  it('rejects no session before making any HTTP request', async () => {
    await dispose();
    await expect(createLocalSchedulesClient(client)).rejects.toThrow(
      new LocalSchedulesError(
        'No running local Schedules session was found in this directory. Start vercel dev here, or use --cwd to select its project directory.'
      )
    );
    expect(networkFetch).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it('rejects multiple live sessions before contacting either endpoint', async () => {
    await createLocalSchedulesSession(cwd, dummyOrigin, session.projectId);
    await expect(createLocalSchedulesClient(client)).rejects.toThrow(
      /Multiple vercel dev sessions/
    );
    expect(networkFetch).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it('reports a dead endpoint without falling back or retrying', async () => {
    await new Promise<void>((resolve, reject) => {
      servers[1].close(error => (error ? reject(error) : resolve()));
    });
    await expect(createLocalSchedulesClient(client)).rejects.toThrow(
      new LocalSchedulesError(
        `The local Schedules session at ${session.origin} is unavailable. Restart vercel dev in this directory. No cloud request was made.`
      )
    );
    expect(networkFetch).toHaveBeenCalledOnce();
    expect(requests).toEqual([]);
  });

  const mismatches = [
    ['version', 2],
    ['id', randomUUID()],
    ['pid', process.pid + 1],
    ['cwd', '/another/project'],
    ['origin', 'http://127.0.0.1:1'],
    ['projectId', 'prj_other'],
    ['version', '1'],
    ['pid', String(process.pid)],
  ] as const;

  it.each(
    mismatches
  )('rejects mismatched handshake %s = %s', async (key, value) => {
    infoReply.body = { ...session, [key]: value };
    await expect(createLocalSchedulesClient(client)).rejects.toThrow(
      /does not match this project instance/
    );
    expect(requests).toHaveLength(1);
    expect(networkFetch).toHaveBeenCalledOnce();
  });

  it.each([
    'version',
    'id',
    'pid',
    'cwd',
    'origin',
    'projectId',
  ] as const)('requires handshake metadata field %s', async key => {
    const metadata: Partial<LocalSchedulesSession> = { ...session };
    delete metadata[key];
    infoReply.body = metadata;
    await expect(createLocalSchedulesClient(client)).rejects.toThrow(
      /does not match this project instance/
    );
    expect(networkFetch).toHaveBeenCalledOnce();
  });

  it.each([
    null,
    'another-session',
  ])('requires matching handshake header %s', async sessionId => {
    infoReply.sessionId = sessionId;
    await expect(createLocalSchedulesClient(client)).rejects.toThrow(
      /stale, not ready, or incompatible/
    );
    expect(networkFetch).toHaveBeenCalledOnce();
  });

  it.each([
    null,
    {},
    [],
  ])('rejects incomplete handshake JSON %j', async body => {
    infoReply.body = body;
    await expect(createLocalSchedulesClient(client)).rejects.toBeInstanceOf(
      LocalSchedulesError
    );
    expect(networkFetch).toHaveBeenCalledOnce();
  });

  it('rejects invalid handshake JSON', async () => {
    infoReply.raw = '{';
    await expect(createLocalSchedulesClient(client)).rejects.toThrow(
      /invalid metadata/
    );
    expect(networkFetch).toHaveBeenCalledOnce();
  });

  it.each([
    401, 404, 503,
  ])('rejects handshake HTTP %i without retry', async status => {
    infoReply.status = status;
    await expect(createLocalSchedulesClient(client)).rejects.toBeInstanceOf(
      LocalSchedulesError
    );
    expect(networkFetch).toHaveBeenCalledOnce();
  });

  it.each([
    301, 302, 303, 307, 308,
  ])('never follows handshake redirect %i', async status => {
    infoReply = {
      status,
      location: `${dummyOrigin}/redirected`,
      body: session,
    };
    await expect(createLocalSchedulesClient(client)).rejects.toBeInstanceOf(
      LocalSchedulesError
    );
    expect(networkFetch).toHaveBeenCalledOnce();
    expect(requests).toHaveLength(1);
  });

  describe.each(operations)('$name', operation => {
    it('matches cloud success JSON and sends only local scope and credentials', async () => {
      operationReply = { status: operation.status, body: operation.response };
      const schedules = await createLocalSchedulesClient(client);
      await expect(operation.run(schedules)).resolves.toEqual(
        operation.expected
      );
      expect(requests).toHaveLength(2);
      const request = requests[1];
      expect(request.method).toBe(operation.method);
      expect(request.url.pathname).toBe(operation.path);
      expect(Object.fromEntries(request.url.searchParams)).toEqual({
        ...operation.query,
        projectId: session.projectId,
      });
      if (operation.body === undefined) {
        expect(request.body).toBe('');
        expect(request.headers['content-type']).toBeUndefined();
      } else {
        expect(request.headers['content-type']).toBe('application/json');
        expect(JSON.parse(request.body)).toEqual(operation.body);
      }
      expect(networkFetch).toHaveBeenCalledTimes(2);
    });

    it.each([
      401, 404, 409, 429, 503,
    ])('preserves responseError API details for HTTP %i without refresh or retry', async status => {
      const schedules = await createLocalSchedulesClient(client);
      operationReply = {
        status,
        body: {
          error: {
            code: 'local_failure',
            message: 'Local failure',
            detail: 'kept',
          },
        },
      };
      const result = operation.run(schedules);
      await expect(result).rejects.toBeInstanceOf(APIError);
      await expect(result).rejects.toMatchObject({
        status,
        code: 'local_failure',
        message: `Local failure (${status})`,
        serverMessage: 'Local failure',
        detail: 'kept',
        ...(status === 429 || status === 503 ? { retryAfterMs: 0 } : {}),
      });
      expect(requests).toHaveLength(2);
      expect(networkFetch).toHaveBeenCalledTimes(2);
    });

    it.each([
      null,
      'replaced-session',
    ])('rejects a missing or mismatched response session header %s', async sessionId => {
      const schedules = await createLocalSchedulesClient(client);
      operationReply = {
        status: operation.status,
        body: operation.response,
        sessionId,
      };
      await expect(operation.run(schedules)).rejects.toBeInstanceOf(
        LocalSchedulesError
      );
      expect(requests).toHaveLength(2);
      expect(networkFetch).toHaveBeenCalledTimes(2);
    });

    it.each([
      302, 307, 308,
    ])('never follows operation redirect %i', async status => {
      const schedules = await createLocalSchedulesClient(client);
      operationReply = {
        status,
        body: operation.response,
        location: `${dummyOrigin}/redirected`,
      };
      await expect(operation.run(schedules)).rejects.toBeInstanceOf(
        LocalSchedulesError
      );
      expect(requests).toHaveLength(2);
      expect(networkFetch).toHaveBeenCalledTimes(2);
    });
  });

  it('preserves pagination cursors, default namespace/limit and empty final pages', async () => {
    const schedules = await createLocalSchedulesClient(client);
    const second = {
      ...wireSchedule,
      scheduleId: 'sch_second',
      trackId: 'production',
    };
    operationReply.body = { data: [wireSchedule, second], cursor: 'next +/?=' };
    const first = await schedules.list();
    expect(first).toEqual({
      data: [schedule, { ...schedule, scheduleId: 'sch_second' }],
      cursor: 'next +/?=',
    });
    expect(Object.fromEntries(requests[1].url.searchParams)).toEqual({
      namespace: 'default',
      limit: '20',
      projectId: session.projectId,
    });
    operationReply.body = { data: [], cursor: null };
    await expect(schedules.list({ cursor: first.cursor! })).resolves.toEqual({
      data: [],
      cursor: null,
    });
    expect(requests[2].url.searchParams.get('cursor')).toBe('next +/?=');
    expect(requests).toHaveLength(3);
  });

  it('omits unset PATCH fields instead of clearing the target', async () => {
    const schedules = await createLocalSchedulesClient(client);
    await schedules.update({ name: 'cleanup', payload: null });
    expect(JSON.parse(requests[1].body)).toEqual({ payload: null });
    expect(requests[1].url.searchParams.get('namespace')).toBe('default');
  });

  it.each([
    'get',
    'delete',
    'enable',
    'disable',
    'invoke',
  ] as const)('uses default namespace for %s', async action => {
    const schedules = await createLocalSchedulesClient(client);
    if (action === 'invoke') operationReply = { status: 204 };
    await schedules[action]({ name: 'cleanup' });
    expect(requests[1].url.searchParams.get('namespace')).toBe('default');
    expect(requests).toHaveLength(2);
  });

  it('accepts a 204 deletion without parsing an empty body', async () => {
    const schedules = await createLocalSchedulesClient(client);
    operationReply = { status: 204 };
    await expect(schedules.delete(identifier)).resolves.toBeUndefined();
    expect(requests).toHaveLength(2);
  });

  it('reports invalid success JSON without retry', async () => {
    const schedules = await createLocalSchedulesClient(client);
    operationReply.raw = '{';
    await expect(schedules.get(identifier)).rejects.toThrow(
      new LocalSchedulesError(
        'The local Schedules session returned an invalid JSON response.'
      )
    );
    expect(requests).toHaveLength(2);
    expect(networkFetch).toHaveBeenCalledTimes(2);
  });

  it('uses responseError fallback for a non-JSON API error', async () => {
    const schedules = await createLocalSchedulesClient(client);
    operationReply = { status: 500, raw: 'Internal server error' };
    await expect(schedules.get(identifier)).rejects.toMatchObject({
      status: 500,
      message: 'Response Error (500)',
      serverMessage: 'Response Error',
    });
    expect(requests).toHaveLength(2);
  });

  it('attempts invoke exactly once when the response is lost after receiving the mutation', async () => {
    const schedules = await createLocalSchedulesClient(client);
    operationReply = { drop: true };
    await expect(schedules.invoke(identifier)).rejects.toThrow(
      new LocalSchedulesError(
        `Could not reach local Schedules at ${session.origin}. No cloud request was made.`
      )
    );
    expect(
      requests.map(request => [request.method, request.url.pathname])
    ).toEqual([
      ['GET', '/v1/info'],
      ['POST', `${schedulePath}/invoke`],
    ]);
    expect(networkFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported executions without any additional HTTP request or mutation', async () => {
    const schedules = await createLocalSchedulesClient(client);
    networkFetch.mockClear();
    await expect(
      schedules.listExecutions({
        ...identifier,
        cursor: 'cursor',
        limit: 5,
        from: 1,
        to: 2,
        sort: 'desc',
        executionId: 'schx_local',
      })
    ).rejects.toThrow(
      new LocalSchedulesError(
        'Execution history is not supported for local Schedules. Inspect the vercel dev output for local executions.'
      )
    );
    expect(networkFetch).not.toHaveBeenCalled();
    expect(requests.map(request => request.url.pathname)).toEqual(['/v1/info']);
  });
});
