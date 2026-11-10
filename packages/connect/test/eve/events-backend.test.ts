import { getVercelOidcToken } from '@vercel/oidc';
import { afterEach, expect, it, vi } from 'vitest';
import { connect } from '../../src/eve/index.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
  verifyVercelOidcToken: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it.each([
  { ttlMs: null },
  { ttlMs: 120_000 },
])('binds each adapter to the credential scope and serializes lifetime %j', async lifetime => {
  vi.stubEnv('VERCEL_REGION', '');
  vi.mocked(getVercelOidcToken).mockResolvedValue('workload');
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return Response.json({
        id: 'sub_a',
        name: 'issue.created',
        arguments: {},
        status: 'active',
        expiresAt: null,
      });
    })
  );
  const createSubject = vi.fn(principal => ({
    type: 'user' as const,
    id: `mapped:${principal.id}`,
    issuer: 'https://app.example',
  }));
  const definition = connect({
    connector: 'oauth/issues',
    tokenParams: {
      scopes: ['read'],
      resources: ['https://issues.example/mcp'],
    },
    createSubject,
  });
  const backend = definition.vercelConnect.experimental_events!;
  const connection = { url: 'https://issues.example/mcp' };
  for (const id of ['alice', 'bob']) {
    const adapter = await backend.createAdapter({
      principal: { type: 'user', id },
      connection,
      destination: { path: '/eve/v1/hooks/issues' },
    });
    await adapter.subscribe({
      name: 'issue.created',
      arguments: {},
      ...lifetime,
      idempotencyKey: id,
    });
  }
  expect(createSubject).toHaveBeenCalledTimes(2);
  expect(
    requests.map(r => (r.tokenParams as { subject: unknown }).subject)
  ).toEqual([
    { type: 'user', id: 'mapped:alice', issuer: 'https://app.example' },
    { type: 'user', id: 'mapped:bob', issuer: 'https://app.example' },
  ]);
  for (const request of requests) {
    expect(request).not.toHaveProperty('expiresAt');
    expect(request).toMatchObject({
      tokenParams: {
        scopes: ['read'],
        resources: ['https://issues.example/mcp'],
      },
      destination: { path: '/eve/v1/hooks/issues' },
      ttlMs: lifetime.ttlMs,
      source: { type: 'mcp', url: connection.url },
    });
  }
});

it('does not fetch credentials or subscribe merely by constructing an auth provider or adapter', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const provider = connect({ connector: 'oauth/issues', principalType: 'app' });
  await provider.vercelConnect.experimental_events!.createAdapter({
    principal: { type: 'app' },
    connection: { url: 'https://issues.example/mcp' },
    destination: { path: '/eve/v1/hooks/issues' },
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(getVercelOidcToken).not.toHaveBeenCalled();
});

it('exposes Connect pagination as eve adapter cursors across empty filtered pages', async () => {
  vi.mocked(getVercelOidcToken).mockResolvedValue('workload');
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ subscriptions: [], pagination: { next: 'next_a' } })
    )
    .mockResolvedValueOnce(
      Response.json({ subscriptions: [], pagination: { next: null } })
    );
  vi.stubGlobal('fetch', fetch);
  const provider = connect({ connector: 'oauth/issues', principalType: 'app' });
  const adapter =
    await provider.vercelConnect.experimental_events!.createAdapter({
      principal: { type: 'app' },
      connection: { url: 'https://issues.example/mcp' },
      destination: { path: '/eve/v1/hooks/issues' },
    });
  const first = await adapter.listSubscriptions({ status: 'active' });
  expect(first).toEqual({ subscriptions: [], nextCursor: 'next_a' });
  expect(
    await adapter.listSubscriptions({
      cursor: first.nextCursor,
      status: 'active',
    })
  ).toEqual({ subscriptions: [] });
  expect(JSON.parse(fetch.mock.lastCall?.[1].body)).toMatchObject({
    tokenParams: { subject: { type: 'app' } },
    cursor: 'next_a',
    status: 'active',
  });
});

it.each([
  'user',
  'app',
] as const)('translates missing credentials for %s event operations', async principalType => {
  vi.mocked(getVercelOidcToken).mockResolvedValue('workload');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        { error: { code: 'no_token', message: 'No valid credential' } },
        { status: 403 }
      )
    )
  );
  const provider = connect({ connector: 'oauth/issues', principalType });
  const adapter =
    await provider.vercelConnect.experimental_events!.createAdapter({
      principal:
        principalType === 'app'
          ? { type: 'app' }
          : { type: 'user', id: 'alice' },
      connection: { url: 'https://issues.example/mcp' },
      destination: { path: '/eve/v1/hooks/issues' },
    });
  for (const operation of [
    () =>
      adapter.subscribe({
        name: 'issue.created',
        arguments: {},
        ttlMs: null,
        idempotencyKey: 'watch',
      }),
    () => adapter.getSubscription({ id: 'sub_a' }),
    () => adapter.listSubscriptions(),
    () => adapter.unsubscribe({ id: 'sub_a' }),
  ]) {
    await expect(operation()).rejects.toMatchObject({
      name:
        principalType === 'user'
          ? 'ConnectionAuthorizationRequiredError'
          : 'ConnectionAuthorizationFailedError',
    });
  }
});

it.each([
  { vercelToken: 'explicit-workload' },
  { region: 'sfo1' },
])('defers event failures to the request with credential options %j', async connectOptions => {
  vi.stubEnv('VERCEL_REGION', '');
  vi.mocked(getVercelOidcToken).mockResolvedValue('workload');
  const fetch = vi.fn(async () =>
    Response.json(
      { error: { code: 'no_token', message: 'No valid credential' } },
      { status: 403 }
    )
  );
  vi.stubGlobal('fetch', fetch);
  const provider = connect({
    connector: 'oauth/issues',
    connectOptions,
  });
  const adapter =
    await provider.vercelConnect.experimental_events!.createAdapter({
      principal: { type: 'user', id: 'alice' },
      connection: { url: 'https://issues.example/mcp' },
      destination: { path: '/eve/v1/hooks/issues' },
    });
  expect(fetch).not.toHaveBeenCalled();
  await expect(adapter.listSubscriptions()).rejects.toMatchObject({
    name: 'ConnectionAuthorizationRequiredError',
  });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining('https://api.vercel.com/'),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer workload' }),
    })
  );
});

it('keeps ID-based management bound to the mapped account without requesting upstream credentials', async () => {
  vi.mocked(getVercelOidcToken).mockResolvedValue('workload');
  const requests: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return Response.json({
        id: 'sub_a',
        name: 'issue.created',
        arguments: {},
        status: 'active',
        expiresAt: null,
      });
    })
  );
  const provider = connect({
    connector: 'oauth/issues',
    tokenParams: { scopes: ['read'], installationId: 'install_a' },
    createSubject: principal => ({
      type: 'user',
      id: `mapped:${principal.type === 'user' ? principal.id : 'app'}`,
    }),
  });
  const adapter =
    await provider.vercelConnect.experimental_events!.createAdapter({
      principal: { type: 'user', id: 'alice' },
      connection: { url: 'https://issues.example/mcp' },
      destination: { path: '/eve/v1/hooks/issues' },
    });
  await adapter.getSubscription({ id: 'sub_a' });
  await adapter.unsubscribe({ id: 'sub_a' });
  expect(requests).toEqual([
    {
      id: 'sub_a',
      expectedSubject: { type: 'user', id: 'mapped:alice' },
      source: { type: 'mcp' },
    },
    {
      id: 'sub_a',
      expectedSubject: { type: 'user', id: 'mapped:alice' },
      source: { type: 'mcp' },
    },
  ]);
});

it('uses the existing error translation when subject resolution fails before an event request', async () => {
  const original = new Error('account mapping failed');
  const translated = new Error('mapped eve failure');
  const onError = vi.fn(() => translated);
  const provider = connect({
    connector: 'oauth/issues',
    createSubject: async () => {
      throw original;
    },
    onError,
  });
  await expect(
    provider.vercelConnect.experimental_events!.createAdapter({
      principal: { type: 'user', id: 'alice' },
      connection: { url: 'https://issues.example/mcp' },
      destination: { path: '/eve/v1/hooks/issues' },
    })
  ).rejects.toBe(translated);
  expect(onError).toHaveBeenCalledExactlyOnceWith(original, 'getToken');
});
