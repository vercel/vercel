import { generateKeyPair, SignJWT, exportJWK } from 'jose5';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { experimental_verifyMcpEvent as verifyMcpEvent } from '../../src/mcp/index.js';

// Exercise the actual OIDC verifier and JOSE signature/claim validation while
// replacing only remote key discovery with controlled rotating public keys.
const keys = vi.hoisted(() => ({ resolver: undefined as unknown }));
vi.mock('jose5', async importOriginal => {
  const jose = await importOriginal<typeof import('jose5')>();
  return {
    ...jose,
    createRemoteJWKSet:
      () =>
      (...args: unknown[]) =>
        (keys.resolver as (...args: unknown[]) => unknown)(...args),
  };
});
vi.mock('@vercel/oidc', () =>
  vi.importActual('../../../oidc/src/verify-vercel-oidc-token.ts')
);

const config = {
  path: '/api/events',
  issuer: 'https://oidc.vercel.com/acme',
  audience: 'https://vercel.com/acme',
  ownerId: 'team_a',
  projectId: 'prj_a',
  environment: 'production',
};
const body = JSON.stringify({
  version: 1,
  deliveryId: 'del_a',
  subscriptionId: 'sub_a',
  source: { type: 'mcp', connectorId: 'scl_a' },
  event: {
    eventId: 'evt_a',
    name: 'issue.created',
    timestamp: '2026-10-01T00:00:00Z',
    data: {},
    cursor: null,
  },
  context: { workflowId: 'wf_a' },
});
let first: Awaited<ReturnType<typeof generateKeyPair>>;
let second: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => {
  first = await generateKeyPair('RS256');
  second = await generateKeyPair('RS256');
  const { createLocalJWKSet } =
    await vi.importActual<typeof import('jose5')>('jose5');
  keys.resolver = createLocalJWKSet({
    keys: [
      { ...(await exportJWK(first.publicKey)), kid: 'key_a', alg: 'RS256' },
      { ...(await exportJWK(second.publicKey)), kid: 'key_b', alg: 'RS256' },
    ],
  });
});
async function token(
  claims: Record<string, unknown> = {},
  key = first.privateKey,
  kid = 'key_a',
  typ = 'JWT'
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: config.issuer,
    aud: config.audience,
    sub: 'owner:acme:project:app:environment:production',
    owner_id: config.ownerId,
    project_id: config.projectId,
    environment: config.environment,
    iat: now,
    exp: now + 300,
    connect: {
      purpose: 'mcp_event_delivery',
      version: 1,
      destinationPath: config.path,
    },
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', typ, kid })
    .sign(key);
}
function request(token: string) {
  return new Request(`https://app.example${config.path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body,
  });
}
it('accepts real RSA signatures across key rotation and both Vercel issuer modes', async () => {
  expect(
    (await verifyMcpEvent(request(await token()), config)).deliveryId
  ).toBe('del_a');
  expect(
    (
      await verifyMcpEvent(
        request(await token({}, second.privateKey, 'key_b')),
        config
      )
    ).deliveryId
  ).toBe('del_a');
  const issuer = 'https://oidc.vercel.com';
  expect(
    (
      await verifyMcpEvent(request(await token({ iss: issuer })), {
        ...config,
        issuer,
      })
    ).deliveryId
  ).toBe('del_a');
});
it.each([
  { iss: 'https://evil.example' },
  { aud: 'https://vercel.com/other' },
  { owner_id: 'team_other' },
  { project_id: 'prj_other' },
  { environment: 'preview' },
  { iat: 0, exp: 300 },
  { connect: undefined },
])('rejects cryptographically signed but unauthorized claims %j', async claims => {
  await expect(
    verifyMcpEvent(request(await token(claims)), config)
  ).rejects.toMatchObject({ code: 'invalid_delivery' });
});
it.each([
  'not-a-jwt',
  'a.b',
  'a.b.c, Bearer d.e.f',
])('rejects malformed JWTs through the real verifier: %s', async value => {
  await expect(verifyMcpEvent(request(value), config)).rejects.toMatchObject({
    code: 'invalid_delivery',
  });
});

it('authenticates valid envelopes without per-body token claims', async () => {
  const signed = await token();
  expect(await verifyMcpEvent(request(signed), config)).toEqual(
    JSON.parse(body)
  );
  const nextDelivery = {
    ...JSON.parse(body),
    source: { type: 'mcp', connectorId: 'scl_b' },
    subscriptionId: 'sub_b',
    deliveryId: 'del_b',
  };
  const nextRequest = new Request(`https://app.example${config.path}`, {
    method: 'POST',
    headers: request(signed).headers,
    body: JSON.stringify(nextDelivery),
  });
  // The token authenticates the sender and destination, not an individual body.
  // The application still authorizes the subscription binding and deduplicates.
  expect(await verifyMcpEvent(nextRequest, config)).toEqual(nextDelivery);
});

it.each([
  {
    purpose: 'authorization_completion_webhook',
    version: 1,
    destinationPath: config.path,
  },
  {
    purpose: 'mcp_event_delivery',
    version: 1,
    destinationPath: '/other/hooks',
  },
  { purpose: 'mcp_event_delivery', version: 2, destinationPath: config.path },
])('rejects a signed token for a different delivery purpose, route or version: %j', async connect => {
  await expect(
    verifyMcpEvent(request(await token({ connect })), config)
  ).rejects.toMatchObject({ code: 'invalid_delivery' });
});

it('rejects a signature made by a different private key', async () => {
  await expect(
    verifyMcpEvent(request(await token({}, second.privateKey)), config)
  ).rejects.toMatchObject({ code: 'invalid_delivery' });
});

it('rejects future issuance with the real OIDC verifier', async () => {
  const iat = Math.floor(Date.now() / 1000) + 120;
  await expect(
    verifyMcpEvent(request(await token({ iat, exp: iat + 300 })), config)
  ).rejects.toMatchObject({ code: 'invalid_delivery' });
});
it('rejects a different token type with the real OIDC verifier', async () => {
  await expect(
    verifyMcpEvent(
      request(await token({}, first.privateKey, 'key_a', 'other')),
      config
    )
  ).rejects.toMatchObject({ code: 'invalid_delivery' });
});
it('rejects an HMAC algorithm with the real OIDC verifier', async () => {
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT', kid: 'key_a' })
    .sign(new TextEncoder().encode('test-secret'));
  await expect(verifyMcpEvent(request(value), config)).rejects.toMatchObject({
    code: 'invalid_delivery',
  });
});

afterEach(() => vi.unstubAllEnvs());
it('uses deployed identity defaults and follows only the signed preview branch', async () => {
  vi.stubEnv('VERCEL_PROJECT_ID', config.projectId);
  vi.stubEnv('VERCEL_TARGET_ENV', 'preview');
  vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'feature/issues');
  vi.stubEnv('VERCEL_ORG_ID', config.ownerId);
  const signed = await token({
    environment: 'preview',
    connect: {
      purpose: 'mcp_event_delivery',
      version: 1,
      destinationPath: config.path,
      previewBranch: 'feature/issues',
    },
  });
  expect(
    (await verifyMcpEvent(request(signed), { path: config.path }))
      .subscriptionId
  ).toBe('sub_a');
  vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'replacement_deployment');
  expect(
    (await verifyMcpEvent(request(signed), { path: config.path }))
      .subscriptionId
  ).toBe('sub_a');
  vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'other-branch');
  await expect(
    verifyMcpEvent(request(signed), { path: config.path })
  ).rejects.toMatchObject({ code: 'invalid_delivery' });
  vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'feature/issues');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_other');
  await expect(
    verifyMcpEvent(request(signed), { path: config.path })
  ).rejects.toMatchObject({ code: 'invalid_delivery' });
});
