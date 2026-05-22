import { describe, test, expect, beforeAll } from 'vitest';
import {
  SignJWT,
  generateKeyPair,
  exportJWK,
  type JWK,
  type KeyLike,
  createLocalJWKSet,
} from 'jose';
import {
  assertValidVercelOidcToken,
  isValidVercelOidcToken,
  UnacceptableVercelOidcTokenError,
  type JwksResolver,
  type VercelOidcTokenMatcher,
} from './validate';

const KID = 'test-key-id';

interface TokenClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  owner?: string;
  owner_id?: string;
  project?: string;
  project_id?: string;
  environment?: string;
  user_id?: string;
}

interface SignOptions {
  issuer?: string;
  expiresAt?: Date;
  algorithm?: string;
  keyId?: string;
  privateKey: KeyLike;
}

async function signToken(
  claims: TokenClaims,
  opts: SignOptions
): Promise<string> {
  const issuer = opts.issuer ?? claims.iss ?? 'https://oidc.vercel.com';
  const exp = opts.expiresAt ?? new Date(Date.now() + 60_000);
  return new SignJWT({ ...claims })
    .setProtectedHeader({
      alg: opts.algorithm ?? 'RS256',
      kid: opts.keyId ?? KID,
      typ: 'JWT',
    })
    .setIssuedAt()
    .setIssuer(issuer)
    .setExpirationTime(Math.floor(exp.getTime() / 1000))
    .sign(opts.privateKey);
}

describe('validate vercel oidc token', () => {
  let privateKey: KeyLike;
  let publicJwk: JWK;
  let otherPrivateKey: KeyLike;
  let jwksResolver: JwksResolver;

  beforeAll(async () => {
    const kp = await generateKeyPair('RS256');
    privateKey = kp.privateKey;
    publicJwk = await exportJWK(kp.publicKey);
    publicJwk.kid = KID;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';

    const otherKp = await generateKeyPair('RS256');
    otherPrivateKey = otherKp.privateKey;

    const localJwks = createLocalJWKSet({ keys: [publicJwk] });
    jwksResolver = () => localJwks;
  });

  const validClaims: TokenClaims = {
    aud: 'https://vercel.com/acme',
    sub: 'owner:acme:project:acme_website:environment:production',
    owner: 'acme',
    owner_id: 'team_abc123',
    project: 'acme_website',
    project_id: 'prj_abc123',
    environment: 'production',
  };

  test('accepts a token with matching team/project/environment', async () => {
    const token = await signToken(validClaims, { privateKey });
    const matchers: VercelOidcTokenMatcher[] = [
      { team: 'acme', project: 'acme_website', environment: 'production' },
    ];
    expect(
      await isValidVercelOidcToken(matchers, token, { jwks: jwksResolver })
    ).toBe(true);
    await expect(
      assertValidVercelOidcToken(matchers, token, { jwks: jwksResolver })
    ).resolves.toBeUndefined();
  });

  test('accepts a token matching any matcher in an array', async () => {
    const token = await signToken(validClaims, { privateKey });
    const matchers: VercelOidcTokenMatcher[] = [
      { team: 'vercel', project: 'vercel-alerts', environment: 'production' },
      { team: 'acme', project: 'acme_website', environment: 'production' },
    ];
    expect(
      await isValidVercelOidcToken(matchers, token, { jwks: jwksResolver })
    ).toBe(true);
  });

  test('accepts a single matcher object (not wrapped in an array)', async () => {
    const token = await signToken(validClaims, { privateKey });
    const matcher: VercelOidcTokenMatcher = {
      team: 'acme',
      project: 'acme_website',
      environment: 'production',
    };
    expect(
      await isValidVercelOidcToken(matcher, token, { jwks: jwksResolver })
    ).toBe(true);
  });

  test('rejects a token whose claims do not match any matcher', async () => {
    const token = await signToken(validClaims, { privateKey });
    const matchers: VercelOidcTokenMatcher[] = [
      { team: 'vercel', project: 'vercel-alerts', environment: 'production' },
    ];
    expect(
      await isValidVercelOidcToken(matchers, token, { jwks: jwksResolver })
    ).toBe(false);
    await expect(
      assertValidVercelOidcToken(matchers, token, { jwks: jwksResolver })
    ).rejects.toBeInstanceOf(UnacceptableVercelOidcTokenError);
  });

  test('rejects a matcher with a wrong environment even when team/project match', async () => {
    const token = await signToken(validClaims, { privateKey });
    const matchers: VercelOidcTokenMatcher[] = [
      { team: 'acme', project: 'acme_website', environment: 'preview' },
    ];
    expect(
      await isValidVercelOidcToken(matchers, token, { jwks: jwksResolver })
    ).toBe(false);
  });

  test('matches by team ID and project ID', async () => {
    const token = await signToken(validClaims, { privateKey });
    expect(
      await isValidVercelOidcToken(
        { teamId: 'team_abc123', projectId: 'prj_abc123' },
        token,
        { jwks: jwksResolver }
      )
    ).toBe(true);
    expect(
      await isValidVercelOidcToken(
        { teamId: 'team_other', projectId: 'prj_abc123' },
        token,
        { jwks: jwksResolver }
      )
    ).toBe(false);
  });

  test('supports raw OIDC claim names (owner, owner_id, project_id, user_id)', async () => {
    const claims: TokenClaims = { ...validClaims, user_id: 'usr_42' };
    const token = await signToken(claims, { privateKey });
    expect(
      await isValidVercelOidcToken(
        {
          owner: 'acme',
          owner_id: 'team_abc123',
          project_id: 'prj_abc123',
          user_id: 'usr_42',
        },
        token,
        { jwks: jwksResolver }
      )
    ).toBe(true);
  });

  test('matches the aud claim', async () => {
    const token = await signToken(validClaims, { privateKey });
    expect(
      await isValidVercelOidcToken({ aud: 'https://vercel.com/acme' }, token, {
        jwks: jwksResolver,
      })
    ).toBe(true);
    expect(
      await isValidVercelOidcToken({ aud: 'https://vercel.com/other' }, token, {
        jwks: jwksResolver,
      })
    ).toBe(false);
  });

  test('matches when the aud claim is an array', async () => {
    const token = await signToken(
      {
        ...validClaims,
        aud: ['https://vercel.com/acme', 'https://vercel.com/acme-staging'],
      },
      { privateKey }
    );
    expect(
      await isValidVercelOidcToken(
        { aud: 'https://vercel.com/acme-staging' },
        token,
        { jwks: jwksResolver }
      )
    ).toBe(true);
  });

  test('rejects an expired token', async () => {
    const token = await signToken(validClaims, {
      privateKey,
      expiresAt: new Date(Date.now() - 60_000),
    });
    expect(
      await isValidVercelOidcToken(
        { team: 'acme', project: 'acme_website', environment: 'production' },
        token,
        { jwks: jwksResolver }
      )
    ).toBe(false);
    await expect(
      assertValidVercelOidcToken(
        { team: 'acme', project: 'acme_website', environment: 'production' },
        token,
        { jwks: jwksResolver }
      )
    ).rejects.toBeInstanceOf(UnacceptableVercelOidcTokenError);
  });

  test('rejects a token signed with a different key', async () => {
    const token = await signToken(validClaims, { privateKey: otherPrivateKey });
    expect(
      await isValidVercelOidcToken(
        { team: 'acme', project: 'acme_website', environment: 'production' },
        token,
        { jwks: jwksResolver }
      )
    ).toBe(false);
  });

  test('rejects a token from a non-Vercel issuer without fetching JWKS', async () => {
    let resolverCalled = false;
    const detectingResolver: JwksResolver = issuer => {
      resolverCalled = true;
      return jwksResolver(issuer);
    };
    const token = await signToken(validClaims, {
      privateKey,
      issuer: 'https://attacker.example.com',
    });
    expect(
      await isValidVercelOidcToken(
        { team: 'acme', project: 'acme_website', environment: 'production' },
        token,
        { jwks: detectingResolver }
      )
    ).toBe(false);
    expect(resolverCalled).toBe(false);
  });

  test('rejects a Vercel-issuer-like URL with an invalid path', async () => {
    const token = await signToken(validClaims, {
      privateKey,
      issuer: 'https://oidc.vercel.com.evil.com',
    });
    expect(
      await isValidVercelOidcToken(
        { team: 'acme', project: 'acme_website', environment: 'production' },
        token,
        { jwks: jwksResolver }
      )
    ).toBe(false);
  });

  test('accepts the team-mode issuer', async () => {
    const token = await signToken(validClaims, {
      privateKey,
      issuer: 'https://oidc.vercel.com/acme',
    });
    expect(
      await isValidVercelOidcToken(
        { team: 'acme', project: 'acme_website', environment: 'production' },
        token,
        { jwks: jwksResolver }
      )
    ).toBe(true);
  });

  test('rejects an empty token string', async () => {
    expect(
      await isValidVercelOidcToken({ team: 'acme' }, '', {
        jwks: jwksResolver,
      })
    ).toBe(false);
    await expect(
      assertValidVercelOidcToken({ team: 'acme' }, '', { jwks: jwksResolver })
    ).rejects.toBeInstanceOf(UnacceptableVercelOidcTokenError);
  });

  test('rejects a malformed token', async () => {
    expect(
      await isValidVercelOidcToken({ team: 'acme' }, 'not-a-jwt', {
        jwks: jwksResolver,
      })
    ).toBe(false);
  });

  test('rejects when no matchers are provided', async () => {
    const token = await signToken(validClaims, { privateKey });
    expect(
      await isValidVercelOidcToken([], token, { jwks: jwksResolver })
    ).toBe(false);
  });

  test('UnacceptableVercelOidcTokenError preserves cause', async () => {
    const token = await signToken(validClaims, { privateKey });
    let error: unknown;
    try {
      await assertValidVercelOidcToken({ team: 'vercel' }, token, {
        jwks: jwksResolver,
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(UnacceptableVercelOidcTokenError);
    expect((error as UnacceptableVercelOidcTokenError).name).toBe(
      'UnacceptableVercelOidcTokenError'
    );
  });
});
