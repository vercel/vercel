import { verifyVercelOidcToken } from '@vercel/oidc';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  experimental_verifyMcpEvent as verifyMcpEvent,
  type Experimental_VerifyMcpEventOptions as VerifyMcpEventOptions,
} from '../../src/mcp/index.js';

vi.mock('@vercel/oidc', () => ({ verifyVercelOidcToken: vi.fn() }));
const destination = 'https://app.example/api/connect/events';
const path = '/api/connect/events';
const config: VerifyMcpEventOptions = {
  path,
  issuer: 'https://oidc.vercel.com/acme',
  audience: 'https://vercel.com/acme',
  ownerId: 'team_a',
  projectId: 'prj_a',
  environment: 'production',
};
const delivery = {
  version: 1,
  deliveryId: 'del_a',
  subscriptionId: 'sub_a',
  source: { type: 'mcp', connectorId: 'scl_a' },
  event: {
    eventId: 'evt_a',
    name: 'issue.created',
    timestamp: '2026-10-01T00:00:00Z',
    data: { title: 'こんにちは' },
    cursor: null,
  },
  context: { workflowId: 'wf_a' },
};
let raw: string;
let payload: Record<string, unknown>;
let deliveryClaims: Record<string, unknown>;
let header: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  raw = JSON.stringify(delivery);
  deliveryClaims = {
    purpose: 'mcp_event_delivery',
    version: 1,
    destinationPath: path,
  };
  const now = Math.floor(Date.now() / 1000);
  payload = {
    iss: config.issuer,
    aud: config.audience,
    owner_id: config.ownerId,
    project_id: config.projectId,
    environment: config.environment,
    iat: now,
    exp: now + 300,
    connect: deliveryClaims,
  };
  header = { alg: 'RS256', typ: 'JWT', kid: 'key_a' };
  vi.mocked(verifyVercelOidcToken).mockImplementation(
    async () => ({ payload, protectedHeader: header }) as never
  );
});
afterEach(() => vi.unstubAllEnvs());
function request(body: BodyInit = raw, headers: Record<string, string> = {}) {
  return new Request(destination, {
    method: 'POST',
    body,
    headers: {
      authorization: 'Bearer aaa.bbb.ccc',
      'content-type': 'application/json',
      ...headers,
    },
  });
}
async function rejects(options: VerifyMcpEventOptions = config) {
  await expect(verifyMcpEvent(request(), options)).rejects.toMatchObject({
    code: 'invalid_delivery',
  });
}
it('verifies existing OIDC with pinned identity, lifetime and cached-key implementation', async () => {
  expect(await verifyMcpEvent(request(), config)).toEqual(delivery);
  expect(verifyVercelOidcToken).toHaveBeenCalledWith(
    'aaa.bbb.ccc',
    expect.objectContaining({
      issuer: config.issuer,
      audience: config.audience,
      ownerId: config.ownerId,
      projectId: config.projectId,
      environment: 'production',
      algorithms: ['RS256'],
      typ: 'JWT',
      maxTokenAge: 300,
      clockTolerance: 60,
    })
  );
});
it('leaves JWT structure validation to the OIDC verifier', async () => {
  vi.mocked(verifyVercelOidcToken).mockRejectedValue({
    code: 'ERR_JWS_INVALID',
  });
  await expect(
    verifyMcpEvent(
      request(raw, { authorization: 'bEaReR malformed-token' }),
      config
    )
  ).rejects.toMatchObject({ code: 'invalid_delivery' });
  expect(verifyVercelOidcToken).toHaveBeenCalledWith(
    'malformed-token',
    expect.any(Object)
  );
});

it('fails closed without trusted receiver configuration, even with spoofed URL and headers', async () => {
  await expect(
    // @ts-expect-error The registered receiver path is required at compile time too.
    verifyMcpEvent(
      request(raw, { host: 'app.example', 'x-forwarded-host': 'app.example' })
    )
  ).rejects.toMatchObject({ code: 'configuration_error' });
  expect(verifyVercelOidcToken).not.toHaveBeenCalled();
});
it.each([
  'https://app.example/events',
  '//app.example/events',
  'events',
  '/events?q=1',
  '/events#fragment',
  '/a/../events',
  '/a/\\events',
])('rejects invalid registered path %s', async path => {
  await expect(
    verifyMcpEvent(request(), { ...config, path })
  ).rejects.toMatchObject({ code: 'configuration_error' });
});

it.each([
  { purpose: 'authorization_complete' },
  { version: 2 },
  { destinationPath: '/other/hooks' },
  { destinationPath: '/other' },
  { previewBranch: 'other-branch' },
])('rejects incorrect delivery claims %j', async change => {
  Object.assign(deliveryClaims, change);
  await rejects();
});
it.each([
  undefined,
  {},
  { purpose: 'mcp_event_delivery' },
])('rejects ordinary workload or incomplete tokens', async connect => {
  payload.connect = connect;
  await rejects();
});
it.each([
  { iat: undefined },
  { exp: undefined },
  { iat: NaN },
  { exp: Infinity },
  { iat: 1.5 },
  { iat: 100, exp: 100 },
  { iat: 1, exp: 302 },
])('rejects invalid token lifetime %j', async change => {
  Object.assign(payload, change);
  await rejects();
});
it.each([
  { kid: undefined },
  { jku: 'https://evil.example/keys' },
  { x5u: 'https://evil.example/cert' },
])('rejects incorrect protected header %j', async change => {
  Object.assign(header, change);
  await rejects();
});
it('accepts JSON whitespace but rejects invalid UTF-8', async () => {
  raw = ` ${raw}`;
  expect(await verifyMcpEvent(request(), config)).toEqual(delivery);
  const invalidUtf8 = new Uint8Array([0xff]);
  await expect(
    verifyMcpEvent(request(invalidUtf8), config)
  ).rejects.toMatchObject({ code: 'invalid_delivery' });
});
it('checks the complete envelope shape after authenticating the sender', async () => {
  for (const value of [
    { ...delivery, source: [] },
    { ...delivery, source: { ...delivery.source, connectorId: '' } },
    { ...delivery, subscriptionId: '' },
    { ...delivery, deliveryId: '' },
    { ...delivery, context: null },
    { ...delivery, event: { ...delivery.event, timestamp: 'invalid' } },
    { ...delivery, extra: true },
  ]) {
    raw = JSON.stringify(value);
    await rejects();
  }
});
it.each<Record<string, string>>([
  { authorization: '' },
  { authorization: 'Basic credentials' },
  { 'content-type': 'text/plain' },
  { 'content-encoding': 'gzip' },
])('rejects invalid delivery headers %j', async headers => {
  await expect(
    verifyMcpEvent(request(raw, headers), config)
  ).rejects.toMatchObject({ code: 'invalid_delivery' });
});
it('rejects GET and a body above the ingress limit', async () => {
  await expect(
    verifyMcpEvent(new Request(destination), config)
  ).rejects.toMatchObject({ code: 'invalid_delivery' });
  await expect(
    verifyMcpEvent(request('a'.repeat(300 * 1024 + 1)), config)
  ).rejects.toMatchObject({ code: 'invalid_delivery' });
});
it('requires exact stable custom environment and preview target bindings', async () => {
  const custom = {
    ...config,
    environment: 'staging',
    customEnvironmentId: 'env_abc',
  };
  payload.custom_environment_id = 'env_other';
  await rejects(custom);
  payload.custom_environment_id = 'env_abc';
  expect(await verifyMcpEvent(request(), custom)).toEqual(delivery);
  delete payload.custom_environment_id;
  deliveryClaims.previewBranch = 'feature/a';
  const preview = { ...config, environment: 'preview', branch: 'feature/b' };
  await rejects(preview);
  expect(
    await verifyMcpEvent(request(), { ...preview, branch: 'feature/a' })
  ).toEqual(delivery);
});
it('requires stable custom and preview identities instead of widening environment checks', async () => {
  for (const options of [
    { ...config, environment: '*' },
    { ...config, projectId: '*' },
    { ...config, environment: 'staging' },
    { ...config, environment: 'preview' },
  ]) {
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', '');
    await expect(verifyMcpEvent(request(), options)).rejects.toMatchObject({
      code: 'configuration_error',
    });
  }
});
it('preserves retryable verification outages without accepting work', async () => {
  for (const error of [
    new Error('JWKS network failure'),
    new TypeError('fetch failed'),
    Object.assign(new Error('Unexpected JWKS HTTP status'), {
      code: 'ERR_JOSE_GENERIC',
    }),
    Object.assign(new Error('Invalid JWKS document'), {
      code: 'ERR_JWKS_INVALID',
    }),
    Object.assign(new Error('JWKS timeout'), { code: 'ERR_JWKS_TIMEOUT' }),
  ]) {
    vi.mocked(verifyVercelOidcToken).mockRejectedValue(error);
    await expect(verifyMcpEvent(request(), config)).rejects.toMatchObject({
      code: 'verification_unavailable',
    });
  }
  vi.mocked(verifyVercelOidcToken).mockRejectedValue({
    code: 'ERR_VERCEL_OIDC_TOKEN_VALIDATION',
  });
  await rejects();
  vi.mocked(verifyVercelOidcToken).mockRejectedValue({
    code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  });
  await rejects();
});
it('returns the same logical delivery ID across independently signed attempts', async () => {
  const first = await verifyMcpEvent(request(), config);
  payload.iat = (payload.iat as number) + 1;
  payload.exp = (payload.exp as number) + 1;
  expect((await verifyMcpEvent(request(), config)).deliveryId).toBe(
    first.deliveryId
  );
});

it.each([
  'checkpoint',
  'opaque'.repeat(1000),
  '',
  null,
])('accepts authenticated event and gap cursors %#', async cursor => {
  for (const value of [
    { ...delivery, event: { ...delivery.event, cursor } },
    {
      version: delivery.version,
      deliveryId: delivery.deliveryId,
      subscriptionId: delivery.subscriptionId,
      source: delivery.source,
      context: delivery.context,
      control: { type: 'gap', cursor },
    },
  ]) {
    raw = JSON.stringify(value);
    expect(await verifyMcpEvent(request(), config)).toEqual(value);
  }
});
it('preserves optional metadata forwarded by Connect', async () => {
  const value = {
    ...delivery,
    event: {
      ...delivery.event,
      _meta: { 'example.com/trace': { id: 'trace_1' }, count: 1 },
    },
  };
  raw = JSON.stringify(value);
  const verified = await verifyMcpEvent(request(), config);
  expect(verified).toEqual(value);
  if ('event' in verified)
    expect(verified.event._meta).toEqual(value.event._meta);
});
it.each([
  null,
  [],
  true,
  42,
  'metadata',
])('rejects malformed optional metadata %#', async _meta => {
  raw = JSON.stringify({ ...delivery, event: { ...delivery.event, _meta } });
  await rejects();
});
it('bounds opaque cursors and metadata by the total UTF-8 body size', async () => {
  const { event, ...envelope } = delivery;
  for (const value of [
    { ...delivery, event: { ...event, cursor: 'a'.repeat(300 * 1024) } },
    { ...envelope, control: { type: 'gap', cursor: 'a'.repeat(300 * 1024) } },
    {
      ...delivery,
      event: { ...event, _meta: { text: 'あ'.repeat(110 * 1024) } },
    },
  ]) {
    raw = JSON.stringify(value);
    await rejects();
  }
});
it('rejects ambiguous and malformed controls from an authenticated sender', async () => {
  const { event, ...envelope } = delivery;
  for (const value of [
    { ...delivery, control: { type: 'gap', cursor: 'fresh' } },
    { ...envelope, control: { type: 'gap', cursor: 42 } },
    { ...envelope, control: { type: 'gap' } },
    { ...envelope, control: { type: 'terminated', cursor: null } },
    { ...envelope, control: { type: 'gap', cursor: null, extra: true } },
    { ...delivery, event: { ...event, cursor: 42 } },
  ]) {
    raw = JSON.stringify(value);
    await rejects();
  }
});

it('defaults to project/environment/branch from the deployed application', async () => {
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_a');
  vi.stubEnv('VERCEL_TARGET_ENV', 'preview');
  vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'feature/a');
  vi.stubEnv('VERCEL_ORG_ID', 'team_a');
  deliveryClaims.previewBranch = 'feature/a';
  expect(await verifyMcpEvent(request(), { path })).toEqual(delivery);
  expect(verifyVercelOidcToken).toHaveBeenCalledWith(
    'aaa.bbb.ccc',
    expect.objectContaining({
      projectId: 'prj_a',
      environment: 'preview',
      ownerId: 'team_a',
    })
  );
  vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'new_deployment_same_branch');
  expect(await verifyMcpEvent(request(), { path })).toEqual(delivery);
  deliveryClaims.previewBranch = 'feature/b';
  await expect(verifyMcpEvent(request(), { path })).rejects.toMatchObject({
    code: 'invalid_delivery',
  });
});
it('never derives the registered path from a request URL or forwarded headers', async () => {
  const changedUrl = new Request('https://untrusted.example/other', {
    method: 'POST',
    body: raw,
    headers: request().headers,
  });
  expect(await verifyMcpEvent(changedUrl, config)).toEqual(delivery);
  deliveryClaims.destinationPath = '/other';
  await rejects();
});
it('returns verified termination and gap controls with application context', async () => {
  const { event, ...envelope } = delivery;
  for (const control of [
    {
      type: 'terminated',
      error: {
        code: -32000,
        message: 'authorization expired',
        data: { reason: 'revoked' },
      },
    },
    { type: 'gap', cursor: 'checkpoint', truncated: true },
  ]) {
    const value = { ...envelope, control };
    raw = JSON.stringify(value);
    expect(await verifyMcpEvent(request(), config)).toEqual(value);
  }
});
