import { describe, expect, test, vi } from 'vitest';

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'jwks'),
  jwtVerify: vi.fn(async (token: string) => ({ payload: decodeToken(token) })),
}));

import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  getIdentity,
  PASSPORT_COOKIE_NAME,
  PASSPORT_HEADER_NAME,
} from '../../src';

function createToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
}

function decodeToken(token: string): Record<string, unknown> {
  const [, encoded] = token.split('.');
  if (!encoded) {
    throw new Error('missing payload');
  }
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
}

const payload = {
  aud: 'https://vercel.com/team-slug/my-project/production',
  connector_id: 'scl_123',
  email: 'user@example.com',
  environment: 'production',
  external_iss: 'https://example.okta.com/oauth2/default',
  external_sub: 'user_123',
  iss: 'https://passport.vercel.com/team-slug',
  name: 'Example User',
  owner: 'team-slug',
  owner_id: 'team_123',
  project: 'my-project',
  project_id: 'prj_123',
  scope: 'owner:team-slug:connector:scl_123:principal:user_123',
  sub: 'owner:team-slug:connector:scl_123:principal:user_123',
  typ: 'passport',
};

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
const verifyOptions = { environment: 'production', projectId: 'prj_123' };

describe('getIdentity', () => {
  test('reads Passport identity from Vercel request context', async () => {
    const token = createToken(payload);
    const previousContext = (globalThis as Record<symbol, unknown>)[
      SYMBOL_FOR_REQ_CONTEXT
    ];

    (globalThis as Record<symbol, unknown>)[SYMBOL_FOR_REQ_CONTEXT] = {
      get: () => ({ headers: { [PASSPORT_HEADER_NAME]: token } }),
    };

    try {
      const identity = await getIdentity(undefined, { verifyOptions });
      expect(identity?.tokenSource).toBe('header');
      expect(identity?.externalSubject).toBe('user_123');
      expect(createRemoteJWKSet).toHaveBeenCalledWith(
        new URL('https://oidc.vercel.com/.well-known/jwks')
      );
      expect(jwtVerify).toHaveBeenCalledWith(
        token,
        'jwks',
        expect.objectContaining({ algorithms: ['RS256'] })
      );
    } finally {
      if (previousContext === undefined) {
        delete (globalThis as Record<symbol, unknown>)[SYMBOL_FOR_REQ_CONTEXT];
      } else {
        (globalThis as Record<symbol, unknown>)[SYMBOL_FOR_REQ_CONTEXT] =
          previousContext;
      }
    }
  });

  test('reads Passport identity from the trusted header', async () => {
    const token = createToken(payload);
    const identity = await getIdentity(
      new Headers({ [PASSPORT_HEADER_NAME]: token }),
      { verifyOptions }
    );

    expect(identity).toMatchObject({
      connectorId: 'scl_123',
      environment: 'production',
      email: 'user@example.com',
      externalIssuer: 'https://example.okta.com/oauth2/default',
      externalSubject: 'user_123',
      name: 'Example User',
      owner: { id: 'team_123', slug: 'team-slug' },
      project: { id: 'prj_123', name: 'my-project' },
      subject: payload.sub,
      token,
      tokenSource: 'header',
      verified: true,
    });
  });

  test('falls back to an explicitly provided Passport cookie', async () => {
    const token = createToken(payload);
    const identity = await getIdentity(
      {
        cookieHeader: `${PASSPORT_COOKIE_NAME}=${token}`,
      },
      { verifyOptions }
    );

    expect(identity?.tokenSource).toBe('cookie');
    expect(identity?.externalSubject).toBe('user_123');
    expect(identity?.verified).toBe(true);
  });

  test('prefers the header over an explicitly provided cookie', async () => {
    const headerToken = createToken(payload);
    const cookieToken = createToken({
      ...payload,
      external_sub: 'cookie-user',
      scope: 'owner:team-slug:connector:scl_123:principal:cookie-user',
      sub: 'owner:team-slug:connector:scl_123:principal:cookie-user',
    });
    const identity = await getIdentity(
      {
        cookieHeader: `${PASSPORT_COOKIE_NAME}=${cookieToken}`,
        headers: { [PASSPORT_HEADER_NAME]: headerToken },
      },
      { verifyOptions }
    );

    expect(identity?.tokenSource).toBe('header');
    expect(identity?.externalSubject).toBe('user_123');
  });

  test('accepts owner-id-based subject and deployment-scoped scope', async () => {
    const actualPassportPayload = {
      ...payload,
      aud: 'owner:team_123:project:prj_123:environment:production',
      scope: 'owner:team_123:project:prj_123:deployment:dpl_123',
      sub: 'owner:team_123:connector:scl_123:principal:user_123',
    };
    const token = createToken(actualPassportPayload);
    const identity = await getIdentity(
      new Headers({ [PASSPORT_HEADER_NAME]: token }),
      { verifyOptions }
    );

    expect(identity).toMatchObject({
      externalSubject: 'user_123',
      owner: { id: 'team_123', slug: 'team-slug' },
      subject: 'owner:team_123:connector:scl_123:principal:user_123',
      verified: true,
    });
  });

  test('rejects Vercel OIDC issuer tokens', async () => {
    const token = createToken({
      ...payload,
      iss: 'https://oidc.vercel.com/team-slug',
    });

    await expect(getIdentity({ token }, { verify: false })).rejects.toThrow(
      'Expected Passport token iss claim to be "https://passport.vercel.com" scoped to an owner.'
    );
  });

  test('rejects non-Passport-shaped tokens', async () => {
    const token = createToken({
      ...payload,
      sub: 'owner:team-slug:project:my-project',
      typ: 'vercel-oidc',
    });

    await expect(getIdentity({ token }, { verify: false })).rejects.toThrow(
      'Passport identity token is missing typ="passport".'
    );
  });

  test('uses explicit local identity when no request identity exists', async () => {
    const identity = await getIdentity(undefined, { localIdentity: payload });

    expect(identity).toMatchObject({
      externalSubject: 'user_123',
      token: null,
      tokenSource: 'local',
      verified: false,
    });
  });

  test('uses local identity from the environment', async () => {
    vi.stubEnv('VERCEL_PASSPORT_IDENTITY', JSON.stringify(payload));

    const identity = await getIdentity();

    expect(identity?.tokenSource).toBe('local');
    expect(identity?.externalSubject).toBe('user_123');

    vi.unstubAllEnvs();
  });

  test('synthesizes a development identity by default outside Vercel', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const identity = await getIdentity();

    expect(identity).toMatchObject({
      connectorId: 'local',
      environment: 'development',
      externalSubject: 'test-user',
      owner: { id: undefined, slug: 'local' },
      project: { id: undefined, name: 'local' },
      subject: 'owner:local:connector:local:principal:test-user',
      token: null,
      tokenSource: 'local',
      verified: false,
    });
    expect(identity?.payload).toMatchObject({
      aud: 'https://vercel.com/local/local/development',
      email: 'test-user@passport.local',
      iss: 'https://passport.vercel.com/local',
      name: 'Test User',
    });
    expect(warn).toHaveBeenCalledWith(
      '[@vercel/passport] Using a local development Passport identity. Set VERCEL_PASSPORT_DEV=0 or pass { development: false } to disable this behavior.'
    );

    warn.mockRestore();
  });

  test('synthesizes a development identity from environment variables', async () => {
    vi.stubEnv('VERCEL_PASSPORT_DEV', '1');
    vi.stubEnv('VERCEL_PASSPORT_DEV_OWNER', 'acme');
    vi.stubEnv('VERCEL_PASSPORT_DEV_OWNER_ID', 'team_acme');
    vi.stubEnv('VERCEL_PASSPORT_DEV_CONNECTOR_ID', 'scl_dev');
    vi.stubEnv('VERCEL_PASSPORT_DEV_EXTERNAL_ISS', 'https://idp.example.com');
    vi.stubEnv('VERCEL_PASSPORT_DEV_EXTERNAL_SUB', 'user_dev');
    vi.stubEnv('VERCEL_PASSPORT_DEV_PROJECT', 'demo');
    vi.stubEnv('VERCEL_PASSPORT_DEV_PROJECT_ID', 'prj_demo');

    const identity = await getIdentity();

    expect(identity).toMatchObject({
      connectorId: 'scl_dev',
      externalIssuer: 'https://idp.example.com',
      externalSubject: 'user_dev',
      owner: { id: 'team_acme', slug: 'acme' },
      project: { id: 'prj_demo', name: 'demo' },
      subject: 'owner:acme:connector:scl_dev:principal:user_dev',
      tokenSource: 'local',
      verified: false,
    });

    vi.unstubAllEnvs();
  });

  test('does not synthesize a development identity on Vercel production', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_PASSPORT_DEV', '1');

    await expect(getIdentity()).resolves.toBeNull();

    vi.unstubAllEnvs();
  });

  test('returns null when development identity is disabled', async () => {
    expect(await getIdentity(undefined, { development: false })).toBeNull();
  });
});
