import { getVercelOidcToken } from '@vercel/oidc';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import {
  ConnectError,
  UserAuthorizationRequiredError,
  type ConnectTokenParams,
  type Experimental_ConnectEventsAdapterOptions,
  experimental_connectEventsAdapter,
  type Experimental_ConnectEventsSubscribeInput,
} from '../../src/ai-sdk/index.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
  verifyVercelOidcToken: vi.fn(),
}));

const fetchMock = vi.fn();
const subject = {
  type: 'user' as const,
  id: 'user_a',
  issuer: 'https://app.example.com',
};
const destination = { path: '/api/connect/events' };
const scope = {
  connector: 'oauth/issues',
  tokenParams: { subject },
  destination,
};
const input = {
  name: 'issue.created',
  arguments: { project_id: 'ABC' },
  context: { bindingId: 'binding_a' },
  ttlMs: null,
  idempotencyKey: 'request_a',
};
const managed = {
  id: 'sub_a',
  name: input.name,
  arguments: input.arguments,
  status: 'pending',
  expiresAt: null,
};
const response = {
  ...managed,
  connectorId: 'scl_a',
  projectId: 'prj_a',
  environment: 'production',
  subject,
  destination,
  context: input.context,
  createdAt: '2026-10-06T00:00:00Z',
  updatedAt: '2026-10-06T00:00:00Z',
};

function createOperations(options: Experimental_ConnectEventsAdapterOptions) {
  return experimental_connectEventsAdapter(options).createAdapter({
    transport: { type: 'custom' },
  });
}

function lastRequest() {
  const [url, init] = fetchMock.mock.lastCall!;
  return { url, ...init, body: JSON.parse(init.body) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VERCEL_REGION', '');
  vi.mocked(getVercelOidcToken).mockResolvedValue('workload_a');
  fetchMock.mockImplementation(async () => Response.json(response));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('experimental_connectEventsAdapter', () => {
  it.each([
    [
      { type: 'http', url: 'https://issues.example/mcp' },
      undefined,
      'https://issues.example/mcp',
    ],
    [
      { type: 'sse', url: 'https://issues.example/sse' },
      undefined,
      'https://issues.example/sse',
    ],
    [
      { type: 'http', url: 'https://issues.example/mcp' },
      'https://issues.example/v2/mcp',
      'https://issues.example/v2/mcp',
    ],
    [
      { type: 'custom' },
      'https://issues.example/mcp',
      'https://issues.example/mcp',
    ],
    [{ type: 'custom' }, undefined, undefined],
  ] as const)('binds transport %j with override %s', async (transport, mcpUrl, expectedUrl) => {
    const integration = experimental_connectEventsAdapter({
      ...scope,
      mcpUrl,
    });
    const operations = integration.createAdapter({ transport });
    expect(fetchMock).not.toHaveBeenCalled();
    await operations.subscribe({
      ...input,
      mcpUrl: 'https://untrusted.example/mcp',
    } as never);
    expect(lastRequest().body.source).toEqual({
      type: 'mcp',
      ...(expectedUrl === undefined ? {} : { url: expectedUrl }),
    });
    expect(lastRequest().body).not.toHaveProperty('mcpUrl');
  });

  it('isolates endpoints when an integration is reused across clients', async () => {
    const integration = experimental_connectEventsAdapter(scope);
    const transport = {
      type: 'http' as const,
      url: 'https://issues.example/v1/mcp',
    };
    const first = integration.createAdapter({ transport });
    transport.url = 'https://issues.example/v2/mcp';
    const second = integration.createAdapter({ transport });
    await second.subscribe(input);
    expect(lastRequest().body.source.url).toBe('https://issues.example/v2/mcp');
    await first.subscribe(input);
    expect(lastRequest().body.source.url).toBe('https://issues.example/v1/mcp');
    await first.getSubscription({ id: managed.id });
    expect(lastRequest().body.source).toEqual({ type: 'mcp' });
  });

  it('configures without network calls, then creates a pending managed watch', async () => {
    const adapter = createOperations(scope);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getVercelOidcToken).not.toHaveBeenCalled();
    expect(await adapter.subscribe(input)).toEqual(managed);
    expect(lastRequest()).toMatchObject({
      url: 'https://api.vercel.com/v1/connect/connectors/oauth%2Fissues/subscriptions',
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: 'Bearer workload_a' },
      body: {
        ...input,
        tokenParams: { subject },
        destination,
        source: { type: 'mcp' },
      },
    });
  });

  it('snapshots its scope and ignores runtime scope/delivery overrides on subscription calls', async () => {
    const config = structuredClone(scope);
    const adapter = createOperations(config);
    config.connector = 'oauth/another';
    config.tokenParams.subject.id = 'user_b';
    config.tokenParams.subject.issuer = 'https://other.example.com';
    config.destination.path = '/another';
    await adapter.subscribe({
      ...input,
      subject: { type: 'app' },
      destination: { path: '/override' },
      delivery: { url: 'https://other.example.com', secret: 'not-accepted' },
      source: { type: 'other' },
      connector: 'oauth/another',
    } as never);
    expect(lastRequest().body).toEqual({
      ...input,
      tokenParams: { subject },
      destination,
      source: { type: 'mcp' },
    });
    expect(lastRequest().url).toContain('/oauth%2Fissues/subscriptions');
  });

  it('snapshots credential selection and uses only subject assertions for ID operations', async () => {
    const tokenParams = {
      subject: { ...subject, experimental_idp: 'oauth/idp' },
      scopes: ['read'],
      installationId: 'installation_a',
      audience: ['https://issues.example.com'],
      resources: ['https://issues.example.com/mcp'],
      authorizationDetails: [
        { type: 'custom', permissions: { issues: ['read'] } },
      ],
      validityBufferMs: 45_000,
    };
    const expected = structuredClone(tokenParams);
    const adapter = createOperations({
      ...scope,
      tokenParams,
    });
    tokenParams.scopes.push('write');
    tokenParams.subject.id = 'other';
    tokenParams.subject.experimental_idp = 'other';
    tokenParams.audience[0] = 'other';
    tokenParams.resources[0] = 'other';
    tokenParams.authorizationDetails[0].permissions.issues.push('write');
    tokenParams.installationId = 'other';
    tokenParams.validityBufferMs = 0;
    await adapter.subscribe({
      ...input,
      tokenParams: { subject: { type: 'app' } },
      scopes: ['admin'],
    } as never);
    expect(lastRequest().body).toEqual({
      tokenParams: expected,
      ...input,
      destination,
      source: { type: 'mcp' },
    });
    for (const method of ['getSubscription', 'unsubscribe'] as const) {
      await adapter[method]({ id: 'sub_a' });
      expect(lastRequest().body).toEqual({
        expectedSubject: expected.subject,
        id: 'sub_a',
        source: { type: 'mcp' },
      });
    }
    fetchMock.mockResolvedValueOnce(
      Response.json({ subscriptions: [], pagination: { next: null } })
    );
    await adapter.listSubscriptions();
    expect(lastRequest().body).toEqual({
      tokenParams: expected,
      source: { type: 'mcp' },
    });
  });

  it.each([
    {
      type: 'jwt-bearer',
      sub: 'service_a',
      iss: 'issuer',
      aud: 'audience',
      additionalClaims: { roles: ['reader'] },
    },
    { type: 'token', token: 'exchange_input' },
    { token: 'exchange_input' },
  ] satisfies ConnectTokenParams['subject'][])('preserves the supported Connect subject %j', async selectedSubject => {
    const adapter = createOperations({
      ...scope,
      tokenParams: { subject: selectedSubject },
    });
    await adapter.subscribe(input);
    expect(lastRequest().body.tokenParams.subject).toEqual(selectedSubject);
    expect(lastRequest().headers.Authorization).toBe('Bearer workload_a');
    for (const method of ['getSubscription', 'unsubscribe'] as const) {
      await adapter[method]({ id: 'sub_a' });
      expect(lastRequest().body).toEqual({
        id: 'sub_a',
        expectedSubject: selectedSubject,
        source: { type: 'mcp' },
      });
    }
  });

  it.each([
    undefined,
    () => Promise.resolve({ subject }),
    {},
    { subject: { type: 'user', id: '' } },
    { subject: { type: 'other' } },
    { subject, scopes: 'read' },
    { subject, resources: [5] },
    { subject, audience: [null] },
    { subject, installationId: 1 },
    { subject, validityBufferMs: NaN },
    { subject, authorizationDetails: [{ type: 'custom', limit: Infinity }] },
  ])('rejects invalid tokenParams before making any request', tokenParams => {
    expect(() => createOperations({ ...scope, tokenParams } as never)).toThrow(
      TypeError
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getVercelOidcToken).not.toHaveBeenCalled();
  });

  it('does not turn extra token parameter properties into subscription fields', async () => {
    const adapter = createOperations({
      ...scope,
      tokenParams: {
        subject,
        destination: { path: '/override' },
        projectId: 'other',
        environment: 'other',
        source: { type: 'other' },
        connector: 'other',
      } as never,
    });
    await adapter.subscribe(input);
    expect(lastRequest().body).toEqual({
      ...input,
      tokenParams: { subject },
      destination,
      source: { type: 'mcp' },
    });
  });

  it('keeps context per watch and snapshots inputs before awaiting credentials', async () => {
    const adapter = createOperations(scope);
    const firstInput = structuredClone(input);
    const first = adapter.subscribe(firstInput);
    firstInput.context.bindingId = 'mutated';
    firstInput.arguments.project_id = 'mutated';
    await first;
    expect(lastRequest().body.context).toEqual(input.context);
    expect(lastRequest().body.arguments).toEqual(input.arguments);
    await adapter.subscribe({
      ...input,
      context: { bindingId: 'binding_b' },
      idempotencyKey: 'request_b',
    });
    expect(lastRequest().body.context).toEqual({ bindingId: 'binding_b' });
  });

  it.each([
    120_000,
    3_600_000,
    31_536_000_000,
    null,
  ])('preserves the requested monitoring TTL %s', async ttlMs => {
    const request = { ...input, ttlMs };
    await createOperations(scope).subscribe(request);
    expect(lastRequest().body).toEqual({
      ...request,
      tokenParams: { subject },
      destination,
      source: { type: 'mcp' },
    });
  });

  it.each([
    {},
    { expiresAt: null },
    { expiresAt: '2030-01-01T00:00:00Z' },
    { ttlMs: 120_000, expiresAt: null },
    { ttlMs: 119_999 },
    { ttlMs: 120_000.5 },
    { ttlMs: 31_536_000_001 },
    { ttlMs: NaN },
    { ttlMs: Infinity },
    { ttlMs: '120000' },
  ])('rejects unsupported lifetimes %o before requesting credentials', async lifetime => {
    const { ttlMs: _, ...request } = input;
    await expect(
      createOperations(scope).subscribe({ ...request, ...lifetime } as never)
    ).rejects.toThrow('ttlMs');
    expect(getVercelOidcToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves an empty filtered page cursor and projects managed results', async () => {
    const adapter = createOperations(scope);
    fetchMock.mockResolvedValueOnce(
      Response.json({ subscriptions: [], pagination: { next: 'next_a' } })
    );
    expect(
      await adapter.listSubscriptions({
        cursor: 'page_a',
        limit: 10,
        status: 'active',
      })
    ).toEqual({ subscriptions: [], nextCursor: 'next_a' });
    expect(lastRequest().body).toEqual({
      tokenParams: { subject },
      cursor: 'page_a',
      limit: 10,
      status: 'active',
      source: { type: 'mcp' },
    });
    fetchMock.mockResolvedValueOnce(
      Response.json({
        subscriptions: [{ ...response, status: 'active' }],
        pagination: { next: null },
      })
    );
    expect(await adapter.listSubscriptions({ cursor: 'next_a' })).toEqual({
      subscriptions: [{ ...managed, status: 'active' }],
    });
    expect(lastRequest().body.cursor).toBe('next_a');
    expect(lastRequest().url).toContain('/subscriptions/actions/list');
  });

  it.each([
    'getSubscription',
    'unsubscribe',
  ] as const)('keeps %s scoped even for a supplied subscription ID', async method => {
    const adapter = createOperations(scope);
    fetchMock.mockResolvedValueOnce(
      Response.json({
        ...response,
        status: 'stopped',
        cleanupStatus: 'pending',
      })
    );
    expect(
      await adapter[method]({
        id: 'sub_a',
        subject: { type: 'app' },
        expectedSubject: { type: 'app' },
      } as never)
    ).toEqual({ ...managed, status: 'stopped', cleanupStatus: 'pending' });
    expect(lastRequest().body).toEqual({
      expectedSubject: subject,
      id: 'sub_a',
      source: { type: 'mcp' },
    });
    expect(lastRequest().url).toContain(
      `/subscriptions/actions/${method === 'getSubscription' ? 'get' : 'unsubscribe'}`
    );
  });

  it.each([
    'getSubscription',
    'unsubscribe',
  ] as const)('never drops ownership assertions after %s is denied', async method => {
    const adapter = createOperations(scope);
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          error: { code: 'subscription_owner_mismatch', message: 'rejected' },
        },
        { status: 403 }
      )
    );
    await expect(adapter[method]({ id: 'sub_other' })).rejects.toMatchObject({
      code: 'subscription_owner_mismatch',
      status: 403,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastRequest().body).toEqual({
      id: 'sub_other',
      expectedSubject: subject,
      source: { type: 'mcp' },
    });
  });

  it('supports app subjects without retaining additional user fields', async () => {
    const adapter = createOperations({
      ...scope,
      tokenParams: { subject: { type: 'app', id: 'ignored' } as never },
    });
    await adapter.subscribe(input);
    expect(lastRequest().body.tokenParams.subject).toEqual({ type: 'app' });
  });

  it('fetches workload credentials per operation and ignores runtime identity overrides', async () => {
    const adapter = createOperations(scope);
    await adapter.subscribe(input);
    vi.mocked(getVercelOidcToken).mockResolvedValueOnce('workload_b');
    await adapter.getSubscription({ id: 'sub_a' });
    expect(lastRequest().headers.Authorization).toBe('Bearer workload_b');
    await adapter.unsubscribe({
      id: 'sub_a',
      options: { vercelToken: 'explicit', region: 'sfo1' } as never,
    });
    expect(getVercelOidcToken).toHaveBeenCalledTimes(3);
    expect(lastRequest().url).toContain('https://api.vercel.com/');
    expect(lastRequest().headers.Authorization).toBe('Bearer workload_a');
  });

  it.each([
    'mcp_events_disabled',
    'quota_exceeded',
    'mcp_needs_auth',
    'idempotency_conflict',
  ])('preserves %s errors', async code => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: { code, message: 'rejected' } }, { status: 403 })
    );
    const result = createOperations(scope).subscribe(input);
    await expect(result).rejects.toBeInstanceOf(ConnectError);
    await expect(result).rejects.toMatchObject({ code, status: 403 });
  });

  it('leaves an ambiguous creation recoverable with the same key and does not retry or cancel it', async () => {
    const adapter = createOperations(scope);
    const failure = new TypeError('connection closed after acceptance');
    fetchMock.mockRejectedValueOnce(failure);
    await expect(adapter.subscribe(input)).rejects.toBe(failure);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await adapter.subscribe(input);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].body).toBe(
      fetchMock.mock.calls[1][1].body
    );
  });

  it('does not start an aborted request', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);
    await expect(
      createOperations(scope).subscribe({
        ...input,
        options: { signal: controller.signal },
      })
    ).rejects.toBe(reason);
    expect(getVercelOidcToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks cancellation after auth and snapshots request options', async () => {
    let resolveToken!: (token: string) => void;
    vi.mocked(getVercelOidcToken).mockReturnValueOnce(
      new Promise(resolve => {
        resolveToken = resolve;
      })
    );
    const controller = new AbortController();
    const options = { signal: controller.signal, region: 'sfo1' };
    const pending = createOperations(scope).getSubscription({
      id: 'sub_a',
      options,
    });
    options.signal = new AbortController().signal;
    controller.abort();
    resolveToken('workload');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards cancellation to fetch without cancelling a watch', async () => {
    const controller = new AbortController();
    const adapter = createOperations(scope);
    await adapter.subscribe({
      ...input,
      options: { signal: controller.signal },
    });
    expect(lastRequest().signal).toBe(controller.signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves consent errors without falling back to different credentials', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          error: {
            code: 'user_authorization_required',
            message: 'Consent required',
          },
        },
        { status: 403 }
      )
    );
    const adapter = createOperations({
      ...scope,
      tokenParams: { subject, scopes: ['read'] },
    });
    await expect(adapter.subscribe(input)).rejects.toBeInstanceOf(
      UserAuthorizationRequiredError
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastRequest().body.tokenParams.scopes).toEqual(['read']);
  });

  it('accepts resolved token parameters with no subject shorthand or resolver', () => {
    const valid: Experimental_ConnectEventsAdapterOptions = { ...scope };
    const shorthand: Experimental_ConnectEventsAdapterOptions = {
      connector: scope.connector,
      destination,
      // @ts-expect-error Subject belongs inside tokenParams.
      subject,
    };
    const lazy: Experimental_ConnectEventsAdapterOptions = {
      ...scope,
      // @ts-expect-error Lazy token resolvers are deferred.
      tokenParams: async () => ({ subject }),
    };
    expect([valid, shorthand, lazy]).toHaveLength(3);
  });

  it.each([
    'subscribe',
    'getSubscription',
    'listSubscriptions',
    'unsubscribe',
  ] as const)('honors nested timeout options for %s during credential lookup', async method => {
    vi.useFakeTimers();
    let resolveToken!: (token: string) => void;
    vi.mocked(getVercelOidcToken).mockReturnValueOnce(
      new Promise(resolve => {
        resolveToken = resolve;
      })
    );
    const adapter = createOperations(scope);
    const options = { timeout: 1000, maxTotalTimeout: 100 };
    const pending =
      method === 'subscribe'
        ? adapter.subscribe({ ...input, options })
        : method === 'listSubscriptions'
          ? adapter.listSubscriptions({ options })
          : adapter[method]({ id: 'sub_a', options });
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    resolveToken('late_token');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can cancel while credentials are unresolved', async () => {
    vi.mocked(getVercelOidcToken).mockReturnValueOnce(new Promise(() => {}));
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const pending = createOperations(scope).getSubscription({
      id: 'sub_a',
      options: { signal: controller.signal },
    });
    const rejected = expect(pending).rejects.toBe(reason);
    controller.abort(reason);
    await rejected;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the deadline active while reading the response body', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => new Promise(() => {}),
    });
    const pending = createOperations(scope).getSubscription({
      id: 'sub_a',
      options: { timeout: 100 },
    });
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(lastRequest().signal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requires explicit lifetime and excludes routing from subscription inputs', () => {
    expectTypeOf(input).toExtend<Experimental_ConnectEventsSubscribeInput>();
    expectTypeOf({
      ...input,
      arguments: { nested: { values: ['one', 'two'] as const } },
      context: { labels: ['watch'] as const },
    }).toExtend<Experimental_ConnectEventsSubscribeInput>();
    // @ts-expect-error Monitoring must have a lifetime.
    const missing: Experimental_ConnectEventsSubscribeInput = {
      name: 'a',
      arguments: {},
      idempotencyKey: 'a',
    };
    const both: Experimental_ConnectEventsSubscribeInput = {
      ...input,
      // @ts-expect-error expiresAt is response-only.
      expiresAt: null,
    };
    const override: Experimental_ConnectEventsSubscribeInput = {
      ...input,
      // @ts-expect-error Subject is supplied by the adapter's trusted scope.
      subject,
    };
    expect([missing, both, override]).toHaveLength(3);
  });
});
