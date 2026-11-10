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
  experimental_discoverEvents as discoverEvents,
  experimental_listEventTypes as listEventTypes,
  experimental_subscribe as subscribe,
  experimental_listSubscriptions as listSubscriptions,
  experimental_getSubscription as getSubscription,
  experimental_unsubscribe as unsubscribe,
  experimental_unsubscribeAll as unsubscribeAll,
  ConnectError,
  type Experimental_McpSubscribeInput,
} from '../../src/mcp/index.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
  verifyVercelOidcToken: vi.fn(),
}));

const subject = { type: 'user' as const, id: 'user_a' };
const create = {
  name: 'issue.created',
  arguments: { project: 'ABC' },
  destination: { path: '/api/connect/events' },
  context: { workflowId: 'wf_a' },
  ttlMs: null,
  idempotencyKey: 'request_a',
};
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VERCEL_REGION', '');
  vi.mocked(getVercelOidcToken).mockResolvedValue('workload-token');
  fetchMock.mockImplementation(async () => new Response('{}'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('managed events', () => {
  it.each([
    120_000,
    3_600_000,
    31_536_000_000,
    null,
  ])('sends the application TTL %s and preserves the server deadline', async ttlMs => {
    const expiresAt = ttlMs === null ? null : '2030-01-01T01:00:00.000Z';
    fetchMock.mockResolvedValueOnce(Response.json({ id: 'sub_a', expiresAt }));
    const input = { ...create, tokenParams: { subject }, ttlMs };
    expectTypeOf(input).toExtend<Experimental_McpSubscribeInput>();
    await expect(subscribe('scl_a', input)).resolves.toEqual({
      id: 'sub_a',
      expiresAt,
    });
    expect(JSON.parse(fetchMock.mock.lastCall?.[1].body)).toEqual({
      ...input,
      source: { type: 'mcp' },
    });
  });

  it.each([
    {},
    { expiresAt: null },
    { expiresAt: '2030-01-01T00:00:00Z' },
    { ttlMs: 120_000, expiresAt: null },
    { ttlMs: 0 },
    { ttlMs: 119_999 },
    { ttlMs: 120_000.5 },
    { ttlMs: 31_536_000_001 },
    { ttlMs: NaN },
    { ttlMs: Infinity },
    { ttlMs: '120000' },
  ])('rejects unsupported lifetime %o before requesting credentials', async lifetime => {
    const { ttlMs: _, ...request } = create;
    await expect(
      subscribe('scl_a', {
        ...request,
        tokenParams: { subject },
        ...lifetime,
      } as never)
    ).rejects.toThrow('ttlMs');
    expect(getVercelOidcToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'next_a',
    null,
  ])('returns subscription pagination with next=%s', async next => {
    const page = { subscriptions: [], pagination: { next } };
    fetchMock.mockResolvedValueOnce(Response.json(page));
    const result = await listSubscriptions('scl_a', {
      tokenParams: { subject },
      cursor: 'page_a',
    });
    expect(result).toEqual(page);
    expectTypeOf(result.pagination.next).toEqualTypeOf<string | null>();
    expect(JSON.parse(fetchMock.mock.lastCall?.[1].body).cursor).toBe('page_a');
  });

  it('keeps MCP catalog pagination separate from subscription pagination', async () => {
    const page = { events: [], nextCursor: 'catalog_next' };
    fetchMock.mockResolvedValueOnce(Response.json(page));
    const result = await listEventTypes('scl_a', {
      tokenParams: { subject },
      cursor: 'catalog_page',
    });
    expect(result).toEqual(page);
    expectTypeOf(result.nextCursor).toEqualTypeOf<string | undefined>();
    expect(
      new URL(fetchMock.mock.lastCall?.[0]).searchParams.get('cursor')
    ).toBe('catalog_page');
  });

  it.each([
    [discoverEvents, { tokenParams: { subject } }, 'events/discover'],
    [subscribe, { tokenParams: { subject }, ...create }, 'subscriptions'],
    [
      listSubscriptions,
      { tokenParams: { subject }, status: 'active', limit: 10 },
      'subscriptions/actions/list',
    ],
    [getSubscription, { id: 'sub_a' }, 'subscriptions/actions/get'],
    [unsubscribe, { id: 'sub_a' }, 'subscriptions/actions/unsubscribe'],
    [
      unsubscribeAll,
      { tokenParams: { subject }, idempotencyKey: 'stop_a' },
      'subscriptions/actions/unsubscribe-all',
    ],
  ] as const)('sends %s in the bound scope', async (method, input, operation) => {
    const result = { id: 'sub_a', status: 'pending' };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(result)));
    expect(
      await (method as (connector: string, input: unknown) => Promise<unknown>)(
        'mcp.linear.app/myapp',
        input
      )
    ).toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.vercel.com/v1/connect/connectors/mcp.linear.app%2Fmyapp/${operation}`,
      {
        method: 'POST',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer workload-token',
        },
        body: JSON.stringify({ ...input, source: { type: 'mcp' } }),
      }
    );
  });

  it.each([
    discoverEvents,
    subscribe,
  ])('serializes the explicit MCP URL under source for %s', async method => {
    await method('oauth/issues', {
      tokenParams: { subject },
      ...create,
      mcpUrl: 'https://issues.example/mcp',
    });
    const body = JSON.parse(fetchMock.mock.lastCall?.[1].body);
    expect(body.source).toEqual({
      type: 'mcp',
      url: 'https://issues.example/mcp',
    });
    expect(body).not.toHaveProperty('mcpUrl');
  });

  it('preserves and snapshots full token selection before resolving workload credentials', async () => {
    const tokenParams = {
      subject: { ...subject, experimental_idp: 'oauth/idp' },
      scopes: ['read'],
      installationId: 'installation_a',
      audience: ['https://issues.example'],
      resources: ['https://issues.example/mcp'],
      authorizationDetails: [{ type: 'custom', permissions: ['read'] }],
      validityBufferMs: 45_000,
    };
    const expected = structuredClone(tokenParams);
    const pending = subscribe('oauth/issues', { tokenParams, ...create });
    tokenParams.subject.id = 'other';
    tokenParams.scopes.push('write');
    tokenParams.authorizationDetails[0].permissions.push('write');
    await pending;
    expect(JSON.parse(fetchMock.mock.lastCall?.[1].body)).toEqual({
      tokenParams: expected,
      ...create,
      source: { type: 'mcp' },
    });
  });

  it.each([
    getSubscription,
    unsubscribe,
  ])('passes only lookup identity and an ownership assertion to %s', async method => {
    const expectedSubject = { ...subject };
    const pending = method('scl_a', { id: 'sub_a', expectedSubject });
    expectedSubject.id = 'mutated';
    await pending;
    expect(JSON.parse(fetchMock.mock.lastCall?.[1].body)).toEqual({
      id: 'sub_a',
      expectedSubject: subject,
      source: { type: 'mcp' },
    });
  });

  it('keeps token selection fields separate from event fields', async () => {
    // Future credential fields cannot overwrite the requested event or route.
    const tokenParams = {
      subject,
      name: 'credential-name',
      destination: { path: '/credential' },
    };
    await subscribe('scl_a', { tokenParams, ...create });
    expect(JSON.parse(fetchMock.mock.lastCall?.[1].body)).toEqual({
      tokenParams,
      ...create,
      source: { type: 'mcp' },
    });
  });

  it('resolves a fresh workload token for every call and preserves explicit overrides', async () => {
    await listEventTypes('scl_a', { tokenParams: { subject } });
    await unsubscribe('scl_a', { expectedSubject: subject, id: 'sub_a' });
    expect(getVercelOidcToken).toHaveBeenCalledTimes(2);
    await listEventTypes(
      'scl_a',
      { tokenParams: { subject } },
      { vercelToken: 'explicit', region: 'sfo1' }
    );
    expect(getVercelOidcToken).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.lastCall?.[0]).toContain(
      'https://api-sfo1.vercel.com/'
    );
    expect(fetchMock.mock.lastCall?.[1].headers.Authorization).toBe(
      'Bearer explicit'
    );
  });

  it('snapshots the subject before awaiting auth and fixes the MCP source', async () => {
    const mutable = { ...subject };
    const result = subscribe('scl_a', {
      ...create,
      tokenParams: { subject: mutable },
      source: { type: 'other' },
    } as never);
    mutable.id = 'other';
    await result;
    expect(JSON.parse(fetchMock.mock.lastCall?.[1].body)).toMatchObject({
      tokenParams: { subject },
      source: { type: 'mcp' },
    });
  });

  it.each([
    'quota_exceeded',
    'mcp_events_not_enabled',
    'mcp_events_disabled',
    'idempotency_conflict',
    'mcp_needs_auth',
  ])('preserves %s errors', async code => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code, message: 'rejected' } }), {
        status: 403,
      })
    );
    const result = subscribe('scl_a', { ...create, tokenParams: { subject } });
    await expect(result).rejects.toBeInstanceOf(ConnectError);
    await expect(result).rejects.toMatchObject({ code, status: 403 });
  });
});

it('uses the merged catalog endpoint and snapshots its authorized resource and token request', async () => {
  const tokenParams = { subject: { ...subject }, scopes: ['read'] };
  const pending = listEventTypes('oauth/issues', {
    tokenParams,
    cursor: '',
    mcpUrl: 'https://issues.example/mcp',
  });
  tokenParams.subject.id = 'changed';
  await pending;
  const [address, init] = fetchMock.mock.lastCall!;
  const url = new URL(address);
  expect(url.pathname).toBe('/v1/connect/mcp-events/event-types');
  expect(url.searchParams.get('connector')).toBe('oauth/issues');
  expect(url.searchParams.get('cursor')).toBe('');
  expect(url.searchParams.get('sourceUrl')).toBe('https://issues.example/mcp');
  expect(JSON.parse(url.searchParams.get('tokenRequest')!)).toEqual({
    subject,
    scopes: ['read'],
  });
  expect(init.method).toBe('GET');
  expect(init.body).toBeUndefined();
});
