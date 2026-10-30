import http from 'http';
import * as asyncListen from 'async-listen';
import { randomUUID } from 'crypto';
import { EventEmitter, once } from 'events';
import { PassThrough } from 'stream';
import type { ChildProcess } from 'child_process';
import { spawnCommand } from '@vercel/build-utils';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ScheduleBroker,
  Schedule,
  ScheduleDispatch,
} from '@vercel-internals/local-schedules';
import DevServer from '../../../../src/util/dev/server';
import { QueueBroker } from '../../../../src/util/dev/queue-broker';
import {
  DEV_RESOURCE_TOKEN,
  listenOnDevResourcePort,
  type DevResourceEndpoints,
} from '../../../../src/util/dev/resource-servers';
import output from '../../../../src/output-manager';
import * as resourceServers from '../../../../src/util/dev/resource-servers';
import * as schedulesSessions from '../../../../src/util/dev/schedules-session';
import {
  LOCAL_SCHEDULES_SESSION_HEADER,
  readLocalSchedulesSessions,
} from '../../../../src/util/dev/schedules-session';

vi.mock('../../../../src/output-manager', () => ({
  default: {
    debug: vi.fn(),
    debugEnabled: false,
    log: vi.fn(),
    print: vi.fn(),
    ready: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    prettyError: vi.fn(),
    time: vi.fn((_label: string, promise: Promise<unknown>) => promise),
  },
}));
vi.mock('@vercel/build-utils', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/build-utils')>()),
  spawnCommand: vi.fn(),
}));
vi.mock('../../../../src/util/dev/port-utils', () => ({
  checkForPort: vi.fn().mockResolvedValue('127.0.0.1'),
}));

interface Internals {
  server: http.Server;
  queueServer: http.Server;
  runtimeCacheServer: http.Server;
  schedulesServer: http.Server;
  schedulesOrigin: string;
  schedulesSession?: Awaited<
    ReturnType<typeof schedulesSessions.createLocalSchedulesSession>
  >;
  stopping: boolean;
  queueOrigin: string;
  runtimeCacheOrigin: string;
  runtimeCache?: { stop(): void };
  _address: URL;
  startPromise: Promise<void>;
  queueBroker: QueueBroker;
  scheduleBroker: ScheduleBroker;
  resourceEndpoints: DevResourceEndpoints;
  dispatchSchedule(invocation: ScheduleDispatch): Promise<void>;
}

const definition = {
  name: 'daily.job',
  expression: { type: 'cron' as const, cron: '0 * * * *' },
  target: { type: 'queue' as const, topic: 'jobs' },
};
const authorization = `Bearer ${DEV_RESOURCE_TOKEN}`;

describe('local Schedules HTTP API', () => {
  let server: DevServer;
  let host: Internals;
  let base: string;
  const enqueue = vi.fn().mockReturnValue({ messageId: 'accepted' });

  async function call(
    path = '',
    method = 'GET',
    body?: unknown,
    headers?: Record<string, string>
  ) {
    return fetch(`${base}/v1/schedules${path}`, {
      method,
      headers: {
        authorization,
        'content-type': 'application/json',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  beforeEach(async () => {
    server = new DevServer(process.cwd(), {
      projectId: 'prj_test',
      orgId: 'team_test',
    });
    host = server as unknown as Internals;
    enqueue.mockClear();
    host.queueBroker = { enqueue, stop: vi.fn() } as unknown as QueueBroker;
    host.schedulesOrigin = (
      await listenOnDevResourcePort(host.schedulesServer, {
        name: 'Vercel Schedules',
        flag: '--schedules-port',
        defaultPort: 4784,
        port: 0,
      })
    ).origin;
    base = host.schedulesOrigin;
    host.schedulesSession = {
      session: {
        version: 1,
        id: randomUUID(),
        pid: process.pid,
        cwd: process.cwd(),
        origin: base,
        projectId: 'prj_test',
      },
      dispose: vi.fn().mockResolvedValue(undefined),
    };
    host._address = new URL(
      (
        await listenOnDevResourcePort(host.server, {
          name: 'Dev',
          flag: '--listen',
          defaultPort: 3000,
          port: 0,
        })
      ).origin
    );
    host.queueOrigin = 'http://127.0.0.1:4782';
    host.runtimeCacheOrigin = 'http://127.0.0.1:4783';
    // Management must remain usable even if the app is waiting on registration.
    host.startPromise = new Promise(() => {});
  });

  afterEach(async () => {
    await server.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('serves authenticated session identity on direct and proxy routes', async () => {
    const session = host.schedulesSession!.session;
    for (const origin of [base, host.resourceEndpoints.schedules!.proxy]) {
      const info = await fetch(`${origin}/v1/info`, {
        headers: { authorization },
      });
      expect(info.status).toBe(200);
      expect(await info.json()).toEqual(session);
      expect(info.headers.get(LOCAL_SCHEDULES_SESSION_HEADER)).toBe(session.id);
      const unauthorized = await fetch(`${origin}/v1/info`, {
        headers: { [LOCAL_SCHEDULES_SESSION_HEADER]: randomUUID() },
      });
      expect(unauthorized.status).toBe(401);
      expect(unauthorized.headers.get(LOCAL_SCHEDULES_SESSION_HEADER)).toBe(
        session.id
      );
      const forbidden = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          `${origin}/v1/info`,
          {
            headers: {
              authorization,
              host: 'attacker.invalid',
              [LOCAL_SCHEDULES_SESSION_HEADER]: randomUUID(),
            },
          },
          res => {
            res.resume();
            resolve(res.statusCode!);
          }
        );
        req.on('error', reject);
        req.end();
      });
      expect(forbidden).toBe(403);
    }
    const created = await call('', 'POST', { ...definition, name: 'info' });
    expect(created.status).toBe(201);
    expect(created.headers.get(LOCAL_SCHEDULES_SESSION_HEADER)).toBe(
      session.id
    );
    expect(await (await call('/info')).json()).toMatchObject({ name: 'info' });
    const matching = await call('', 'GET', undefined, {
      [LOCAL_SCHEDULES_SESSION_HEADER]: session.id,
    });
    expect(matching.status).toBe(200);
  });

  it('returns 503 for identity before publication and during shutdown', async () => {
    const published = host.schedulesSession;
    try {
      host.schedulesSession = undefined;
      expect(
        (
          await fetch(`${base}/v1/info`, {
            headers: {
              authorization,
              [LOCAL_SCHEDULES_SESSION_HEADER]: published!.session.id,
            },
          })
        ).status
      ).toBe(503);
      host.schedulesSession = published;
      host.stopping = true;
      expect(
        (
          await fetch(`${base}/v1/info`, {
            headers: {
              authorization,
              [LOCAL_SCHEDULES_SESSION_HEADER]: published!.session.id,
            },
          })
        ).status
      ).toBe(503);
    } finally {
      host.schedulesSession = published;
      host.stopping = false;
    }
  });

  it.each([
    ['', 'POST', { ...definition, name: 'new-job' }],
    ['/daily.job', 'PATCH', { target: { type: 'queue', topic: 'changed' } }],
    ['/daily.job', 'DELETE', undefined],
    ['/daily.job/disable', 'POST', undefined],
    ['/daily.job/enable', 'POST', undefined],
    ['/daily.job/invoke', 'POST', undefined],
  ] as const)('rejects a mismatched session before %s %s without mutation', async (path, method, body) => {
    const record = await (await call('', 'POST', definition)).json();
    for (const origin of [base, host.resourceEndpoints.schedules!.proxy]) {
      base = origin;
      const response = await call(path, method, body, {
        [LOCAL_SCHEDULES_SESSION_HEADER]: randomUUID(),
      });
      expect(response.status).toBe(409);
      expect(response.headers.get(LOCAL_SCHEDULES_SESSION_HEADER)).toBe(
        host.schedulesSession!.session.id
      );
      expect(await response.json()).toMatchObject({
        error: {
          code: 'local_session_mismatch',
          message: expect.any(String),
        },
      });
      expect(await (await call()).json()).toEqual({
        data: [record],
        cursor: null,
      });
      expect(enqueue).not.toHaveBeenCalled();
    }
  });

  it('serves CRUD, state changes, and manual invocation with SDK response shapes', async () => {
    const create = await call('', 'POST', {
      ...definition,
      payload: { nested: { n: 1 } },
      jitter: 2,
    });
    expect(create.status).toBe(201);
    const record = (await create.json()) as Schedule;
    expect(record).toEqual({
      ...definition,
      scheduleId: expect.stringMatching(/^sch_[0-7][0-9A-HJKMNP-TV-Z]{25}$/),
      ownerId: 'team_test',
      projectId: 'prj_test',
      namespace: 'default',
      timezone: 'UTC',
      jitter: 2,
      state: 'active',
      source: 'dynamic',
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
    expect(await (await call('/daily%2Ejob')).json()).toEqual(record);
    expect(await (await call()).json()).toEqual({
      data: [record],
      cursor: null,
    });
    const conflict = await call('', 'POST', definition);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      error: { code: 'schedule_already_exists' },
    });
    const disabled = await call('/daily.job/disable', 'POST');
    expect(disabled.status).toBe(200);
    expect(await disabled.json()).toMatchObject({ state: 'inactive' });
    expect((await call('/daily.job/disable', 'POST')).status).toBe(200);
    const invoked = await call('/daily.job/invoke', 'POST');
    expect(invoked.status).toBe(204);
    expect(await invoked.text()).toBe('');
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue.mock.calls[0]).toHaveLength(3);
    expect(enqueue.mock.calls[0][0]).toBe('jobs');
    expect(JSON.parse(enqueue.mock.calls[0][1].toString())).toEqual({
      scheduleId: record.scheduleId,
      executionId: expect.stringMatching(/^schx_[0-7][0-9A-HJKMNP-TV-Z]{25}$/),
      name: definition.name,
      namespace: 'default',
      source: 'dynamic',
      scheduledAt: expect.any(String),
      expression: '0 * * * *',
      payload: { nested: { n: 1 } },
    });
    expect(enqueue.mock.calls[0][2]).toBe('application/json');
    const patched = await call('/daily.job', 'PATCH', {
      payload: null,
      jitter: null,
      target: { type: 'queue', topic: 'updated' },
    });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({
      target: { type: 'queue', topic: 'updated' },
    });
    expect(await (await call('/daily.job')).json()).not.toHaveProperty(
      'jitter'
    );
    expect((await call('/daily.job/invoke', 'POST')).status).toBe(204);
    expect(JSON.parse(enqueue.mock.calls[1][1].toString())).not.toHaveProperty(
      'payload'
    );
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(JSON.parse(enqueue.mock.calls[1][1].toString())).toMatchObject({
      scheduleId: record.scheduleId,
      executionId: expect.stringMatching(/^schx_[0-7][0-9A-HJKMNP-TV-Z]{25}$/),
    });
    expect(
      await (await call('/daily.job/enable', 'POST')).json()
    ).toMatchObject({ state: 'active' });
    const deleted = await call('/daily.job', 'DELETE');
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ scheduleId: record.scheduleId });
    expect((await call('/daily.job')).status).toBe(404);
    expect((await call('/daily.job/invoke', 'POST')).status).toBe(404);
  });

  it.each([
    '_job',
    '.daily',
    '-batch',
  ])('rejects leading-punctuation name %s like the hosted API', async identifier => {
    const create = await call('', 'POST', { ...definition, name: identifier });
    expect(create.status).toBe(400);
    expect(await create.json()).toMatchObject({
      error: {
        code: 'bad_request',
        message: expect.stringContaining('starting with a letter or number'),
      },
    });
    expect(await (await call()).json()).toEqual({ data: [], cursor: null });
  });

  it('enables until a time and maps broker errors to hosted API codes', async () => {
    await call('', 'POST', definition);
    expect(
      (await call('/daily.job/enable', 'POST', { until: Date.now() + 60_000 }))
        .status
    ).toBe(409);
    const alreadyActive = await call('/daily.job/enable', 'POST', {
      until: Date.now() + 60_000,
    });
    expect(await alreadyActive.json()).toMatchObject({
      error: { code: 'schedule_already_active' },
    });
    await call('/daily.job/disable', 'POST');
    const until = Date.now() + 60_000;
    const enabled = await call('/daily.job/enable', 'POST', { until });
    expect(enabled.status).toBe(200);
    expect(await enabled.json()).toMatchObject({
      state: 'active',
      activeUntil: until,
    });
    const past = await call('/daily.job/enable', 'POST', { until: 1 });
    expect(past.status).toBe(400);
    expect(await past.json()).toMatchObject({
      error: { code: 'active_until_in_past' },
    });
    expect(
      (await call('/daily.job/enable', 'POST', { until: 'soon' })).status
    ).toBe(400);
    const typeChange = await call('/daily.job', 'PATCH', {
      expression: { type: 'single', at: '2099-01-01T00:00' },
    });
    expect(typeChange.status).toBe(409);
    expect(await typeChange.json()).toMatchObject({
      error: { code: 'schedule_type_change_not_allowed' },
    });
    const invalidCron = await call('', 'POST', {
      ...definition,
      name: 'bad-cron',
      expression: { type: 'cron', cron: 'bad' },
    });
    expect(invalidCron.status).toBe(400);
    expect(await invalidCron.json()).toMatchObject({
      error: { code: 'invalid_cron_expression' },
    });
  });

  it('isolates namespaces, paginates, coerces limits, and keeps scope immutable', async () => {
    for (const name of ['a', 'b', 'c'])
      expect(
        (await call('', 'POST', { ...definition, name, namespace: 'batch' }))
          .status
      ).toBe(201);
    expect(await (await call()).json()).toEqual({ data: [], cursor: null });
    const first = (await (
      await call('?namespace=batch&limit=2')
    ).json()) as ReturnType<ScheduleBroker['list']>;
    expect(first.data.map((s: { name: string }) => s.name)).toEqual(['a', 'b']);
    const second = (await (
      await call(
        `?namespace=batch&limit=2&cursor=${encodeURIComponent(first.cursor!)}`
      )
    ).json()) as ReturnType<ScheduleBroker['list']>;
    expect(second.data.map((s: { name: string }) => s.name)).toEqual(['c']);
    expect(second.cursor).toBeNull();
    expect(
      (await call(`?cursor=${encodeURIComponent(first.cursor!)}`)).status
    ).toBe(400);
    expect((await call('/a?namespace=batch')).status).toBe(200);
    expect((await call('?namespace=batch&limit=2.0')).status).toBe(200);
    expect((await call('?projectId=prj_other')).status).toBe(400);
    expect((await call('?projectId=prj_test')).status).toBe(200);
    const scoped = await (
      await call('/a?namespace=batch&ownerId=other&trackId=production')
    ).json();
    expect(scoped).toMatchObject({
      ownerId: 'team_test',
      projectId: 'prj_test',
    });
    expect(scoped).not.toHaveProperty('trackId');
  });

  it.each([
    null,
    [],
    'text',
    {},
    { ...definition, target: null },
    { ...definition, target: { type: 'function', function: 'api/task' } },
    { ...definition, target: { type: 'queue', topic: 'jobs', extra: true } },
    { ...definition, expression: null },
    { ...definition, expression: {} },
    { ...definition, expression: { type: 'cron', cron: 42 } },
    {
      ...definition,
      expression: { type: 'cron', cron: '* * * * *', extra: true },
    },
    {
      ...definition,
      expression: { type: 'single', at: '2026-10-01T00:00:00Z' },
    },
    { ...definition, timezone: null },
    { ...definition, timezone: 'Invalid/Zone' },
    { ...definition, name: null },
    { ...definition, namespace: null },
    { ...definition, jitter: null },
    { ...definition, jitter: '2' },
    { ...definition, jitter: 0 },
    { ...definition, projectId: 'other' },
    { ...definition, state: 'inactive' },
    { ...definition, unknown: true },
  ])('rejects malformed create input %# with 400', async body => {
    const response = await call('', 'POST', body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'bad_request', message: expect.any(String) },
    });
  });

  it.each([
    { expression: null },
    { target: null },
    { timezone: null },
    { target: { type: 'function', function: 'api/task' } },
    { name: 'other' },
    { namespace: 'other' },
    { payload: {}, ownerId: 'other' },
  ])('rejects invalid patch %#', async patch => {
    await call('', 'POST', definition);
    expect((await call('/daily.job', 'PATCH', patch)).status).toBe(400);
  });

  it.each([
    '',
    'jobs.with-dots',
    ' ',
    'jobs with spaces',
    'jobs/other',
    'jobs\n',
    'caf\u00e9',
  ])('rejects Queue topic %j on create and patch without mutating schedules', async topic => {
    const target = { type: 'queue', topic };
    const invalid = await call('', 'POST', { ...definition, target });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: { code: 'bad_request' },
    });
    expect(await (await call()).json()).toEqual({ data: [], cursor: null });

    const created = await call('', 'POST', {
      ...definition,
      payload: { original: true },
    });
    expect(created.status).toBe(201);
    const original = await created.json();
    const patched = await call('/daily.job', 'PATCH', {
      target,
      payload: { changed: true },
      timezone: 'America/New_York',
    });
    expect(patched.status).toBe(400);
    expect(await patched.json()).toMatchObject({
      error: { code: 'bad_request' },
    });
    expect(await (await call('/daily.job')).json()).toEqual(original);
    expect((await call('/daily.job/invoke', 'POST')).status).toBe(204);
    expect(enqueue.mock.calls[0][0]).toBe('jobs');
    expect(JSON.parse(enqueue.mock.calls[0][1].toString())).toMatchObject({
      payload: { original: true },
    });
  });

  it.each([
    'AZaz09_-',
    '_',
    '-',
  ])('accepts Queue topic %j on create and patch', async topic => {
    const target = { type: 'queue', topic };
    const created = await call('', 'POST', { ...definition, target });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ target });
    expect(
      (await call('/daily.job', 'PATCH', { target: definition.target })).status
    ).toBe(200);
    const patched = await call('/daily.job', 'PATCH', { target });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ target });
    expect((await call('/daily.job/invoke', 'POST')).status).toBe(204);
    expect(enqueue.mock.calls[0][0]).toBe(topic);
  });

  it.each([
    false,
    0,
    '',
    [1, 2],
  ])('preserves dynamic API payload %j on create and patch', async payload => {
    expect((await call('', 'POST', { ...definition, payload })).status).toBe(
      201
    );
    expect((await call('/daily.job/invoke', 'POST')).status).toBe(204);
    expect(JSON.parse(enqueue.mock.calls[0][1].toString())).toMatchObject({
      payload,
    });
    expect(
      (await call('/daily.job', 'PATCH', { payload: { updated: payload } }))
        .status
    ).toBe(200);
    expect((await call('/daily.job/invoke', 'POST')).status).toBe(204);
    expect(JSON.parse(enqueue.mock.calls[1][1].toString())).toMatchObject({
      payload: { updated: payload },
    });
  });

  it.each([
    '?limit=0',
    '?limit=101',
    '?limit=1.5',
    '?limit=wat',
    '?limit=',
    '?cursor=',
    '?cursor=broken',
    '?namespace=',
    '/bad%2Fname',
    '/bad%ZZ',
  ])('rejects invalid query or name %s', async path => {
    expect((await call(path)).status).toBe(400);
  });

  it('handles malformed JSON, empty bodies, oversized bodies, methods, and unknown routes', async () => {
    for (const body of ['', '{']) {
      const response = await fetch(`${base}/v1/schedules`, {
        method: 'POST',
        headers: { authorization },
        body,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { message: 'Expected a JSON object as the request body' },
      });
    }
    expect(
      (
        await call('', 'POST', {
          ...definition,
          payload: 'x'.repeat(8 * 1024),
        })
      ).status
    ).toBe(400);
    expect(
      (
        await call('', 'POST', {
          ...definition,
          payload: 'x'.repeat(30 * 1024),
        })
      ).status
    ).toBe(413);
    const wrongMethod = await call('', 'DELETE');
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('allow')).toBe('GET, POST');
    expect((await call('/daily.job/unknown')).status).toBe(404);
    expect(
      (await fetch(`${base}/health`, { headers: { authorization } })).status
    ).toBe(404);
  });

  it('accepts generated names and returns helpful missing/failed target errors', async () => {
    const response = await call('', 'POST', {
      expression: definition.expression,
      target: definition.target,
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      name: expect.stringMatching(/^dyn\./),
    });
    await call('', 'POST', definition);
    enqueue.mockImplementationOnce(() => {
      throw new Error('Local Queue is unavailable');
    });
    const failed = await call('/daily.job/invoke', 'POST');
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({
      error: { message: 'Local Queue is unavailable' },
    });
    host.scheduleBroker.reconcileStatic([
      {
        ...definition,
        name: 'function',
        target: { type: 'function', function: 'api/missing' },
      },
    ]);
    const missing = await call('/function/invoke', 'POST');
    expect(missing.status).toBe(500);
    expect(await missing.json()).toMatchObject({
      error: {
        message: 'Schedule function "api/missing" is missing or not ready',
      },
    });
  });

  it('authenticates direct and prefixed routes before app readiness and validates Hosts', async () => {
    const requestHost = (host: string) =>
      new Promise<number>((resolve, reject) => {
        const req = http.request(
          `${base}/v1/schedules`,
          {
            headers: { authorization, host },
          },
          res => {
            res.resume();
            resolve(res.statusCode!);
          }
        );
        req.on('error', reject);
        req.end();
      });
    expect(
      (await call('', 'GET', undefined, { authorization: '' })).status
    ).toBe(401);
    expect(
      (
        await call('', 'GET', undefined, {
          authorization: 'Bearer production-token',
        })
      ).status
    ).toBe(401);
    expect(await requestHost('attacker.invalid')).toBe(403);
    expect(await requestHost(`localhost:${new URL(base).port}`)).toBe(200);
    expect(await requestHost('localhost:1')).toBe(403);
    const directBase = base;
    base = host.resourceEndpoints.schedules!.proxy;
    expect(
      (
        await call('?namespace=proxied', 'POST', {
          ...definition,
          namespace: 'proxied',
        })
      ).status
    ).toBe(201);
    expect((await call('/daily%2Ejob?namespace=proxied')).status).toBe(200);
    expect(
      (await call('', 'GET', undefined, { authorization: '' })).status
    ).toBe(401);
    expect(await requestHost('attacker.invalid')).toBe(403);
    expect(
      await requestHost(`host.docker.internal:${host._address.port}`)
    ).toBe(200);
    const badPrefix = `${host._address.origin}/_svc/_schedules/wrong/v1/schedules`;
    expect(
      (await fetch(badPrefix, { headers: { authorization } })).status
    ).toBe(404);
    base = directBase;
    expect((await call('/daily.job?namespace=proxied')).status).toBe(200);
  });

  it('enqueues the complete dynamic envelope into the real Queue broker before consumers start', async () => {
    host.queueBroker = new QueueBroker([], () => null);
    const submit = vi.spyOn(host.queueBroker, 'enqueue');
    await call('', 'POST', {
      ...definition,
      payload: { nested: { source: 'user', payload: [1, 2] } },
    });
    expect((await call('/daily.job/invoke', 'POST')).status).toBe(204);
    const { messageId } = submit.mock.results[0].value;
    const messages = (host.queueBroker as any).messages as Map<
      string,
      { payload: Buffer }
    >;
    expect(
      JSON.parse(messages.get(messageId)!.payload.toString())
    ).toMatchObject({
      name: 'daily.job',
      namespace: 'default',
      source: 'dynamic',
      executionId: expect.any(String),
      payload: { nested: { source: 'user', payload: [1, 2] } },
    });
  });

  it('dispatches bodyless function targets, reports failure, and aborts drain waiters', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const resolve = vi
      .spyOn(server, 'resolveDevFunction')
      .mockReturnValue(invoke);
    host.scheduleBroker.reconcileStatic([
      {
        ...definition,
        target: { type: 'function', function: 'tasks/exact' },
      },
    ]);
    const patch = await call('/daily.job', 'PATCH', { payload: { x: 1 } });
    expect(patch.status).toBe(409);
    expect(await patch.json()).toMatchObject({
      error: { code: 'static_schedule' },
    });
    await host.scheduleBroker.invoke({ name: definition.name });
    expect(resolve).toHaveBeenCalledWith('tasks/exact');
    expect(invoke).toHaveBeenCalledWith({
      method: 'POST',
      body: Buffer.alloc(0),
      signal: expect.any(AbortSignal),
      headers: expect.objectContaining({
        'ce-type': 'com.vercel.schedule.v1beta',
        'ce-id': expect.any(String),
        'ce-vssscheduledat': expect.any(String),
        'ce-vssexpression': '0 * * * *',
      }),
    });
    const { headers } = invoke.mock.calls[0][0];
    expect(headers).not.toHaveProperty('content-type');
    expect(headers).not.toHaveProperty('ce-time');
    expect(headers).not.toHaveProperty('ce-vssscheduleexecutionid');
    expect(Number.isFinite(Date.parse(headers['ce-vssscheduledat']))).toBe(
      true
    );
    invoke.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(
      host.scheduleBroker.invoke({ name: definition.name })
    ).rejects.toThrow('returned HTTP 503');
    invoke.mockResolvedValueOnce(null);
    await expect(
      host.scheduleBroker.invoke({ name: definition.name })
    ).rejects.toThrow('missing or not ready');
    invoke.mockImplementationOnce(() => new Promise(() => {}));
    const pending = host.scheduleBroker.invoke({ name: definition.name });
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledTimes(4);
    await host.scheduleBroker.close();
    await expect(pending).resolves.toBeUndefined();
    expect(invoke.mock.calls.at(-1)![0].signal.aborted).toBe(true);
  });

  it('does not dispatch an already-aborted occurrence', async () => {
    const controller = new AbortController();
    controller.abort();
    const invocation = {
      signal: controller.signal,
      delivery: { type: 'queue', topic: 'jobs', message: {} },
    } as ScheduleDispatch;
    await expect(host.dispatchSchedule(invocation)).rejects.toThrow();
    expect(enqueue).not.toHaveBeenCalled();
    const resolve = vi.spyOn(server, 'resolveDevFunction');
    await expect(
      host.dispatchSchedule({
        ...invocation,
        delivery: { type: 'function', function: 'api/job', headers: {} },
      })
    ).rejects.toThrow();
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe('local Schedules path dispatch', () => {
  it.each([
    ['with', 'local-secret'],
    ['without', undefined],
  ])('sends the delivery headers %s CRON_SECRET through vercel dev', async (_label, cronSecret) => {
    const cwd = await mkdtemp(join(tmpdir(), 'vc-schedules-path-'));
    const app = http.createServer();
    const received = new Promise<http.IncomingMessage>(resolve => {
      app.once('request', (req, res) => {
        res.end();
        resolve(req);
      });
    });
    await asyncListen.default(app, { port: 0, host: '127.0.0.1' });
    try {
      const server = new DevServer(cwd, {});
      // No framework dev command: vercel dev serves the path itself.
      const host = server as unknown as Internals & {
        _address: URL;
        devProcessOrigin?: string;
      };
      host._address = new URL(
        `http://127.0.0.1:${(app.address() as { port: number }).port}`
      );
      expect(host.devProcessOrigin).toBeUndefined();
      server.envConfigs.runEnv = cronSecret ? { CRON_SECRET: cronSecret } : {};
      await host.dispatchSchedule({
        signal: new AbortController().signal,
        delivery: {
          type: 'path',
          path: '/api/cron',
          requestMethod: 'GET',
          headers: {
            'user-agent': 'vercel-cron/1.0',
            'ce-vssexpression': '0 * * * *',
          },
        },
      } as unknown as ScheduleDispatch);
      const req = await received;
      expect(req.method).toBe('GET');
      expect(req.url).toBe('/api/cron');
      expect(req.headers).toMatchObject({
        'user-agent': 'vercel-cron/1.0',
        'ce-vssexpression': '0 * * * *',
      });
      if (cronSecret) {
        expect(req.headers.authorization).toBe(`Bearer ${cronSecret}`);
      } else {
        expect(req.headers).not.toHaveProperty('authorization');
      }
    } finally {
      app.close();
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

describe('Schedules startup lifecycle', () => {
  it.each([
    false,
    true,
  ])('closes startup-waiting app requests when a resource bind fails (concurrent stop: %s)', async concurrentStop => {
    const cwd = await mkdtemp(join(tmpdir(), 'vc-schedules-request-failure-'));
    const server = new DevServer(cwd, {
      queuePort: 0,
      runtimeCachePort: 0,
      schedulesPort: 0,
    });
    const host = server as unknown as Internals;
    const error = new Error('Resource bind failed with an app request pending');
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let entered!: () => void;
    const binding = new Promise<void>(resolve => {
      entered = resolve;
    });
    const listen = resourceServers.listenOnDevResourcePort;
    vi.spyOn(resourceServers, 'listenOnDevResourcePort').mockImplementation(
      async (resource, options) => {
        const result = await listen(resource, options);
        if (options.flag === '--schedules-port') {
          entered();
          await gate;
          throw error;
        }
        return result;
      }
    );
    const config = vi.spyOn(server, 'getVercelConfig');
    const publication = vi.spyOn(
      schedulesSessions,
      'createLocalSchedulesSession'
    );
    const startup = server.start(0, '127.0.0.1');
    const startupResult = startup.catch(err => err);
    let request: http.ClientRequest | undefined;
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([binding, startup]);
      const resources = [
        host.server,
        host.runtimeCacheServer,
        host.queueServer,
        host.schedulesServer,
      ];
      for (const resource of resources) expect(resource.listening).toBe(true);
      const received = once(host.server, 'request');
      const requestResult = new Promise<void>((resolve, reject) => {
        request = http.get(server.address, { agent: false }, response => {
          response.resume();
          response.on('end', resolve);
          response.on('error', reject);
        });
        request.on('error', reject);
      }).catch(err => err);
      await received;
      await new Promise(resolve => setImmediate(resolve));
      const stopping = concurrentStop ? server.stop() : undefined;
      release();
      const results = await Promise.race([
        Promise.all([startupResult, requestResult, stopping]),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error('Startup cleanup deadlocked on the app request')
              ),
            5000
          );
        }),
      ]);
      expect(results[0]).toBe(error);
      expect(results[1]).toMatchObject({ code: 'ECONNRESET' });
      await server.stop();
      if (stopping) expect(server.stop()).toBe(stopping);
      for (const resource of resources) {
        expect(resource.listening).toBe(false);
        expect(resource.address()).toBeNull();
      }
      expect(config).not.toHaveBeenCalled();
      expect(publication).not.toHaveBeenCalled();
    } finally {
      clearTimeout(timeout);
      release();
      request?.destroy();
      host.server.closeAllConnections();
      await startupResult;
      await server.stop();
      await rm(cwd, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('drains active app requests gracefully after startup is ready', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'vc-schedules-ready-request-'));
    const server = new DevServer(cwd, {
      queuePort: 0,
      runtimeCachePort: 0,
      schedulesPort: 0,
    });
    const host = server as unknown as Internals;
    vi.spyOn(server, 'getVercelConfig').mockResolvedValue({});
    vi.spyOn(server, 'updateBuildMatches').mockResolvedValue(undefined);
    vi.spyOn(server, 'runDevCommand').mockResolvedValue(undefined);
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let entered!: () => void;
    const serving = new Promise<void>(resolve => {
      entered = resolve;
    });
    vi.spyOn(server, 'serveProjectAsNowV2').mockImplementation(
      async (_req, res) => {
        entered();
        await gate;
        res.end('ready response');
      }
    );
    const close = vi.spyOn(host.server, 'close');
    const forceClose = vi.spyOn(host.server, 'closeAllConnections');
    let request: http.ClientRequest | undefined;
    try {
      await server.start(0, '127.0.0.1');
      const response = new Promise<string>((resolve, reject) => {
        request = http.get(server.address, { agent: false }, res => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', chunk => {
            body += chunk;
          });
          res.on('end', () => resolve(body));
          res.on('error', reject);
        });
        request.on('error', reject);
      });
      const result = response.catch(err => err);
      await Promise.race([serving, result]);
      const stopped = vi.fn();
      const stopping = server.stop();
      void stopping.then(stopped);
      await new Promise(resolve => setImmediate(resolve));
      expect(close).toHaveBeenCalledOnce();
      expect(forceClose).not.toHaveBeenCalled();
      expect(stopped).not.toHaveBeenCalled();
      release();
      expect(await result).toBe('ready response');
      await stopping;
      expect(stopped).toHaveBeenCalledOnce();
      expect(host.server.listening).toBe(false);
    } finally {
      release();
      request?.destroy();
      await server.stop();
      await rm(cwd, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it.each(
    [
      '--listen',
      '--runtime-cache-port',
      '--queue-port',
      '--schedules-port',
    ].flatMap(flag =>
      ['before bind', 'after bind', 'failed bind'].map(phase => ({
        flag,
        phase,
      }))
    )
  )('drains concurrent stops during $flag startup ($phase)', async ({
    flag,
    phase,
  }) => {
    const cwd = await mkdtemp(join(tmpdir(), 'vc-schedules-binding-'));
    const server = new DevServer(cwd, {
      queuePort: 0,
      runtimeCachePort: 0,
      schedulesPort: 0,
    });
    const host = server as unknown as Internals;
    const bindError = new Error('Resource listener failed');
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let entered!: () => void;
    const binding = new Promise<void>(resolve => {
      entered = resolve;
    });
    const bound = new Set<http.Server>();
    async function deferredBind<T>(
      resource: http.Server,
      listenerFlag: string,
      bind: () => Promise<T>
    ) {
      if (listenerFlag === flag && phase === 'before bind') {
        entered();
        await gate;
      }
      const result = await bind();
      expect(resource.listening).toBe(true);
      expect(resource.address()).toMatchObject({ port: expect.any(Number) });
      bound.add(resource);
      if (listenerFlag === flag && phase !== 'before bind') {
        entered();
        await gate;
        if (phase === 'failed bind') throw bindError;
      }
      return result;
    }
    const listenApp = asyncListen.listen;
    vi.spyOn(asyncListen, 'listen').mockImplementation((resource, ...args) =>
      resource === host.server
        ? deferredBind(host.server, '--listen', () =>
            listenApp(resource, ...args)
          )
        : listenApp(resource, ...args)
    );
    const listen = resourceServers.listenOnDevResourcePort;
    const listener = vi
      .spyOn(resourceServers, 'listenOnDevResourcePort')
      .mockImplementation((resource, options) =>
        deferredBind(resource, options.flag, () => listen(resource, options))
      );
    const publication = vi.spyOn(
      schedulesSessions,
      'createLocalSchedulesSession'
    );
    const config = vi.spyOn(server, 'getVercelConfig');
    const registration = vi.spyOn(QueueBroker.prototype, 'registerServices');
    const queueStop = vi.spyOn(QueueBroker.prototype, 'stop');
    const startup = server.start(0, '127.0.0.1');
    const result = startup.catch(error => error);
    try {
      await Promise.race([
        binding,
        startup.then(() => {
          throw new Error('Startup completed before the deferred bind');
        }),
      ]);
      expect(host.server.listening).toBe(
        flag !== '--listen' || phase !== 'before bind'
      );
      const queue = host.queueBroker;
      const cacheStop =
        host.runtimeCache && vi.spyOn(host.runtimeCache, 'stop');
      registration.mockClear();
      const calls = listener.mock.calls.length;
      const stopped = vi.fn();
      const stopping = server.stop();
      const signalStop = server.stop(0);
      void stopping.then(stopped);
      void signalStop.then(stopped);
      expect(signalStop).toBe(stopping);
      await new Promise(resolve => setImmediate(resolve));
      expect(stopped).not.toHaveBeenCalled();
      release();
      const [error] = await Promise.all([result, stopping, signalStop]);
      expect(error).toBe(phase === 'failed bind' ? bindError : undefined);
      expect(stopped).toHaveBeenCalledTimes(2);
      expect(server.stop()).toBe(stopping);
      expect(listener).toHaveBeenCalledTimes(calls);
      expect(bound.size).toBe(calls + 1);
      for (const resource of [host.server, ...bound]) {
        expect(resource.listening).toBe(false);
        expect(resource.address()).toBeNull();
      }
      expect(host.queueBroker).toBe(queue);
      expect(queueStop).toHaveBeenCalledTimes(queue ? 1 : 0);
      if (cacheStop) expect(cacheStop).toHaveBeenCalledOnce();
      expect(host.runtimeCache).toBeUndefined();
      expect(publication).not.toHaveBeenCalled();
      expect(config).not.toHaveBeenCalled();
      expect(registration).not.toHaveBeenCalled();
      expect(await readLocalSchedulesSessions(cwd)).toEqual([]);
    } finally {
      release();
      await startup.catch(() => {});
      await server.stop();
      // Also clean up leaked listeners when running against the regression.
      await Promise.all(
        [
          host.server,
          host.runtimeCacheServer,
          host.queueServer,
          host.schedulesServer,
        ].map(
          resource =>
            new Promise<void>(resolve => resource.close(() => resolve()))
        )
      );
      host.queueBroker?.stop();
      await rm(cwd, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it.each([
    false,
    true,
  ])('does not open listeners when stopped before the first bind (start called: %s)', async startFirst => {
    const server = new DevServer(process.cwd(), {
      queuePort: 0,
      runtimeCachePort: 0,
      schedulesPort: 0,
    });
    const host = server as unknown as Internals;
    const listen = vi.spyOn(host.server, 'listen');
    const resources = vi.spyOn(resourceServers, 'listenOnDevResourcePort');
    const config = vi.spyOn(server, 'getVercelConfig');
    try {
      const startup = startFirst ? server.start(0, '127.0.0.1') : undefined;
      await server.stop();
      await (startup ?? server.start(0, '127.0.0.1'));
      expect(listen).not.toHaveBeenCalled();
      expect(resources).not.toHaveBeenCalled();
      expect(config).not.toHaveBeenCalled();
    } finally {
      await server.stop();
      vi.restoreAllMocks();
    }
  });

  it('does not retry non-address-in-use app listener errors or deadlock cleanup', async () => {
    const server = new DevServer(process.cwd(), {});
    const host = server as unknown as Internals;
    const error = Object.assign(new Error('Listen denied'), { code: 'EACCES' });
    const listen = vi.spyOn(host.server, 'listen').mockImplementation(() => {
      queueMicrotask(() => host.server.emit('error', error));
      return host.server;
    });
    try {
      await expect(server.start(0, '127.0.0.1')).rejects.toBe(error);
      expect(listen).toHaveBeenCalledOnce();
      expect(host.server.listening).toBe(false);
      expect(() => host.scheduleBroker.create(definition)).toThrow('closed');
    } finally {
      await server.stop();
      vi.restoreAllMocks();
    }
  });

  it('does not register services after config resolution stops the server', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'vc-schedules-config-stop-'));
    const server = new DevServer(cwd, {
      queuePort: 0,
      runtimeCachePort: 0,
      schedulesPort: 0,
    });
    const host = server as unknown as Internals;
    const registration = vi.spyOn(QueueBroker.prototype, 'registerServices');
    vi.spyOn(server, 'getVercelConfig').mockImplementation(async () => {
      await server.stop();
      registration.mockClear();
      return {};
    });
    const command = vi.spyOn(server, 'runDevCommand');
    const builds = vi.spyOn(server, 'updateBuildMatches');
    try {
      await server.start(0, '127.0.0.1');
      expect(command).not.toHaveBeenCalled();
      expect(builds).not.toHaveBeenCalled();
      expect(registration).not.toHaveBeenCalled();
      expect(host.server.listening).toBe(false);
      expect(host.queueServer.listening).toBe(false);
      expect(host.runtimeCacheServer.listening).toBe(false);
      expect(host.schedulesServer.listening).toBe(false);
      expect(await readLocalSchedulesSessions(cwd)).toEqual([]);
    } finally {
      await server.stop();
      await rm(cwd, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('keeps a concurrent stop pending until startup-failure disposal finishes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'vc-schedules-start-failure-'));
    const server = new DevServer(cwd, {
      queuePort: 0,
      runtimeCachePort: 0,
      schedulesPort: 0,
    });
    const host = server as unknown as Internals;
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let disposing!: () => void;
    const disposal = new Promise<void>(resolve => {
      disposing = resolve;
    });
    const closeClock = vi.spyOn(host.scheduleBroker, 'close');
    vi.spyOn(server, 'getVercelConfig').mockImplementation(async () => {
      expect(host.schedulesServer.listening).toBe(true);
      expect(await readLocalSchedulesSessions(cwd)).toEqual([
        host.schedulesSession!.session,
      ]);
      const published = host.schedulesSession!;
      const dispose = published.dispose;
      vi.spyOn(published, 'dispose').mockImplementation(async () => {
        disposing();
        await gate;
        await dispose();
      });
      throw new Error('startup failed after publication');
    });
    const startup = server.start(0, '127.0.0.1');
    const failed = expect(startup).rejects.toThrow(
      'startup failed after publication'
    );
    try {
      await Promise.race([
        disposal,
        failed.then(() => {
          throw new Error('Startup failed before disposal');
        }),
      ]);
      const stopped = vi.fn();
      const signalStop = server.stop(0);
      void signalStop.then(stopped);
      await new Promise(resolve => setImmediate(resolve));
      expect(stopped).not.toHaveBeenCalled();
      expect(await readLocalSchedulesSessions(cwd)).toHaveLength(1);
      release();
      await Promise.all([failed, signalStop]);
      expect(stopped).toHaveBeenCalledOnce();
      expect(server.stop()).toBe(signalStop);
      expect(closeClock).toHaveBeenCalledOnce();
      expect(await readLocalSchedulesSessions(cwd)).toEqual([]);
      expect(host.schedulesServer.listening).toBe(false);
      expect(host.server.listening).toBe(false);
    } finally {
      release();
      await failed;
      await server.stop();
      await rm(cwd, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('keeps concurrent stops pending until publication finishes without leaving a late descriptor', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'vc-schedules-publishing-'));
    const server = new DevServer(cwd, {
      queuePort: 0,
      runtimeCachePort: 0,
      schedulesPort: 0,
    });
    const host = server as unknown as Internals;
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let publishing!: () => void;
    const publication = new Promise<void>(resolve => {
      publishing = resolve;
    });
    const create = schedulesSessions.createLocalSchedulesSession;
    vi.spyOn(
      schedulesSessions,
      'createLocalSchedulesSession'
    ).mockImplementation(async (...args) => {
      expect(host.schedulesServer.listening).toBe(true);
      publishing();
      await gate;
      return create(...args);
    });
    const config = vi.spyOn(server, 'getVercelConfig');
    const startup = server.start(0, '127.0.0.1');
    try {
      await Promise.race([
        publication,
        startup.then(() => {
          throw new Error('Startup completed before publication');
        }),
      ]);
      const stopping = server.stop();
      expect(host.stopping).toBe(true);
      const stopped = vi.fn();
      const signalStop = server.stop(0);
      void signalStop.then(stopped);
      await new Promise(resolve => setImmediate(resolve));
      expect(stopped).not.toHaveBeenCalled();
      expect(signalStop).toBe(stopping);
      release();
      await Promise.all([startup, stopping, signalStop]);
      expect(stopped).toHaveBeenCalledOnce();
      expect(server.stop()).toBe(stopping);
      expect(await readLocalSchedulesSessions(cwd)).toEqual([]);
      expect(host.schedulesSession).toBeUndefined();
      expect(host.schedulesServer.listening).toBe(false);
      expect(config).not.toHaveBeenCalled();
    } finally {
      release();
      await startup.catch(() => {});
      await server.stop();
      await rm(cwd, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('injects local credentials into the actual dev-command spawn before SDK imports', async () => {
    const server = new DevServer(process.cwd(), {
      projectSettings: { devCommand: 'unit-dev' },
    });
    const host = server as unknown as Internals;
    host.schedulesOrigin = 'http://127.0.0.1:4784';
    host._address = new URL('http://localhost:3000');
    vi.stubEnv('VERCEL_SCHEDULE_BASE_URL', 'https://remote.invalid');
    vi.stubEnv('VERCEL_SCHEDULE_TOKEN', 'remote-token');
    server.envConfigs.allEnv = {
      VERCEL_SCHEDULE_BASE_URL: 'https://env-file.invalid',
      VERCEL_SCHEDULE_TOKEN: 'env-file-token',
    };
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    vi.mocked(spawnCommand).mockReturnValueOnce(
      child as unknown as ChildProcess
    );
    try {
      await server.runDevCommand();
      expect(spawnCommand).toHaveBeenCalledWith(
        'unit-dev',
        expect.objectContaining({
          env: expect.objectContaining({
            VERCEL_SCHEDULE_BASE_URL: host.schedulesOrigin,
            VERCEL_SCHEDULE_TOKEN: DEV_RESOURCE_TOKEN,
            VERCEL_SCHEDULE_DEV_API_VERSION: '1',
          }),
        })
      );
    } finally {
      child.stderr.unpipe(process.stderr);
      child.stdout.destroy();
      child.stderr.destroy();
      Object.assign(server, { devProcess: undefined });
      await server.stop();
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    }
  });

  it.each([
    ['runtimeCachePort', '--runtime-cache-port'],
    ['queuePort', '--queue-port'],
    ['schedulesPort', '--schedules-port'],
  ])('closes all resources if the pinned %s cannot bind', async (option, flag) => {
    const occupied = http.createServer();
    const { port } = await listenOnDevResourcePort(occupied, {
      name: 'Occupied',
      flag: '--listen',
      defaultPort: 4784,
      port: 0,
    });
    const server = new DevServer(process.cwd(), {
      queuePort: 0,
      runtimeCachePort: 0,
      schedulesPort: 0,
      [option]: port,
    });
    const host = server as unknown as Internals;
    try {
      await expect(server.start(0, '127.0.0.1')).rejects.toThrow(
        `Choose another port with ${flag}`
      );
      expect(host.schedulesServer.listening).toBe(false);
      expect(host.server.listening).toBe(false);
      expect(host.queueServer.listening).toBe(false);
      expect(host.runtimeCacheServer.listening).toBe(false);
      expect(() => host.scheduleBroker.create(definition)).toThrow('closed');
    } finally {
      await server.stop();
      await new Promise<void>(resolve => occupied.close(() => resolve()));
    }
  });

  it.each([
    false,
    true,
  ])('accepts registration before app boot completes, starts the clock after readiness, and closes it (fallback: %s)', async fallback => {
    if (fallback) {
      const listen = listenOnDevResourcePort;
      vi.spyOn(resourceServers, 'listenOnDevResourcePort').mockImplementation(
        async (server, options) => {
          const result = await listen(server, options);
          return options.flag === '--schedules-port'
            ? { ...result, defaultPort: 4784 }
            : result;
        }
      );
    }
    const cwd = await mkdtemp(join(tmpdir(), 'vc-schedules-unit-'));
    await writeFile(
      join(cwd, 'package.json'),
      '{"private":true,"scripts":{"build":"exit 0"}}'
    );
    await writeFile(join(cwd, 'index.html'), '<h1>Local Schedules</h1>');
    const server = new DevServer(cwd, {
      queuePort: 0,
      runtimeCachePort: 0,
      schedulesPort: 0,
    });
    const host = server as unknown as Internals;
    vi.spyOn(server, 'exit').mockImplementation(async () => {
      throw new Error('Unexpected dev exit');
    });
    vi.spyOn(server, 'updateBuildMatches').mockResolvedValue(undefined);
    let release!: () => void;
    const ready = new Promise<void>(resolve => {
      release = resolve;
    });
    let registered!: () => void;
    const registration = new Promise<void>(resolve => {
      registered = resolve;
    });
    const startClock = vi.spyOn(host.scheduleBroker, 'start');
    const closeClock = vi.spyOn(host.scheduleBroker, 'close');
    vi.spyOn(server, 'runDevCommand').mockImplementation(async () => {
      expect(startClock).not.toHaveBeenCalled();
      const env = server.envConfigs.allEnv;
      expect(env).toMatchObject({
        VERCEL_SCHEDULE_BASE_URL: host.schedulesOrigin,
        VERCEL_SCHEDULE_TOKEN: DEV_RESOURCE_TOKEN,
        VERCEL_SCHEDULE_DEV_API_VERSION: '1',
      });
      const response = await fetch(
        `${env.VERCEL_SCHEDULE_BASE_URL}/v1/schedules`,
        {
          method: 'POST',
          headers: { authorization, 'content-type': 'application/json' },
          body: JSON.stringify(definition),
        }
      );
      expect(response.status).toBe(201);
      registered();
      await ready;
    });
    try {
      const startup = server.start(0, '127.0.0.1');
      await Promise.race([
        registration,
        startup.then(() => {
          throw new Error('Startup completed before registration');
        }),
      ]);
      expect(startClock).not.toHaveBeenCalled();
      expect(host.queueBroker).toBeInstanceOf(QueueBroker);
      expect(await readLocalSchedulesSessions(cwd)).toEqual([
        host.schedulesSession!.session,
      ]);
      release();
      await startup;
      expect(startClock).toHaveBeenCalledOnce();
      expect(vi.mocked(output.print).mock.calls.flat().join('')).toContain(
        'Vercel Schedules'
      );
      if (fallback) {
        const printed = vi.mocked(output.print).mock.calls.flat().join('');
        expect(printed).toContain(
          '! Vercel Schedules default port 4784 is unavailable; listening on'
        );
        expect(printed).toContain('Pin a port with --schedules-port');
        expect(printed).not.toContain('WARNING!');
      }
      await server.stop();
      expect(closeClock).toHaveBeenCalledOnce();
      expect(await readLocalSchedulesSessions(cwd)).toEqual([]);
      expect(() =>
        host.scheduleBroker.create({ ...definition, name: 'after-close' })
      ).toThrow('closed');
    } finally {
      release();
      await server.stop();
      await rm(cwd, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('runs single-fire delivery once with a controlled clock and contains observer errors', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T00:00:00Z'));
    const server = new DevServer(process.cwd(), {});
    const host = server as unknown as Internals;
    const queue = new QueueBroker([], () => null);
    host.queueBroker = queue;
    const enqueue = vi.spyOn(queue, 'enqueue');
    const single = {
      ...definition,
      expression: { type: 'single' as const, at: '2026-09-21T00:01' },
      payload: { nested: true },
    };
    try {
      const record = host.scheduleBroker.create(single);
      await vi.advanceTimersByTimeAsync(59_000);
      expect(enqueue).not.toHaveBeenCalled();
      host.scheduleBroker.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(enqueue).toHaveBeenCalledOnce();
      expect(JSON.parse(enqueue.mock.calls[0][1].toString())).toMatchObject({
        scheduleId: record.scheduleId,
        executionId: expect.stringMatching(
          /^schx_[0-7][0-9A-HJKMNP-TV-Z]{25}$/
        ),
        scheduledAt: '2026-09-21T00:01:00.000Z',
        expression: '2026-09-21T00:01:00',
        payload: { nested: true },
      });
      expect(
        JSON.parse(enqueue.mock.calls[0][1].toString())
      ).not.toHaveProperty('firedAt');
      await vi.advanceTimersByTimeAsync(1000);
      expect(enqueue).toHaveBeenCalledOnce();
      vi.mocked(output.error).mockImplementationOnce(() => {
        throw new Error('observer');
      });
      enqueue.mockImplementationOnce(() => {
        throw new Error('queue failed');
      });
      host.scheduleBroker.create({
        ...single,
        name: 'failed',
        expression: { type: 'single', at: '2026-09-21T00:02' },
      });
      await vi.advanceTimersByTimeAsync(59_000);
      expect(output.error).toHaveBeenCalledWith(
        expect.stringContaining('queue failed')
      );
    } finally {
      await server.stop();
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
});
