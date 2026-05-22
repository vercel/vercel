import { describe, test, expect, beforeAll } from 'vitest';
import {
  SignJWT,
  generateKeyPair,
  exportJWK,
  type JWK,
  type KeyLike,
} from 'jose';
import {
  assertValidVercelOidcToken,
  isValidVercelOidcToken,
  UnacceptableVercelOidcTokenError,
  type Jwks,
  type JwksFetcher,
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
  let fetchJwks: JwksFetcher;

  beforeAll(async () => {
    const kp = await generateKeyPair('RS256', { extractable: true });
    privateKey = kp.privateKey;
    publicJwk = await exportJWK(kp.publicKey);
    publicJwk.kid = KID;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';

    const otherKp = await generateKeyPair('RS256', { extractable: true });
    otherPrivateKey = otherKp.privateKey;

    const jwks: Jwks = { keys: [publicJwk as Jwks['keys'][number]] };
    fetchJwks = async () => jwks;
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
    expect(await isValidVercelOidcToken(matchers, token, { fetchJwks })).toBe(
      true
    );
    await expect(
      assertValidVercelOidcToken(matchers, token, { fetchJwks })
    ).resolves.toBeUndefined();
  });

  test('accepts a token matching any matcher in an array', async () => {
    const token = await signToken(validClaims, { privateKey });
    const matchers: VercelOidcTokenMatcher[] = [
      { team: 'vercel', project: 'vercel-alerts', environment: 'production' },
      { team: 'acme', project: 'acme_website', environment: 'production' },
    ];
    expect(await isValidVercelOidcToken(matchers, token, { fetchJwks })).toBe(
      true
    );
  });

  test('accepts a single matcher object (not wrapped in an array)', async () => {
    const token = await signToken(validClaims, { privateKey });
    const matcher: VercelOidcTokenMatcher = {
      team: 'acme',
      project: 'acme_website',
      environment: 'production',
    };
    expect(await isValidVercelOidcToken(matcher, token, { fetchJwks })).toBe(
      true
    );
  });

  test('rejects a token whose claims do not match any matcher', async () => {
    const token = await signToken(validClaims, { privateKey });
    const matchers: VercelOidcTokenMatcher[] = [
      { team: 'vercel', project: 'vercel-alerts', environment: 'production' },
    ];
    expect(await isValidVercelOidcToken(matchers, token, { fetchJwks })).toBe(
      false
    );
    await expect(
      assertValidVercelOidcToken(matchers, token, { fetchJwks })
    ).rejects.toBeInstanceOf(UnacceptableVercelOidcTokenError);
  });

  test('rejects a matcher with a wrong environment even when team/project match', async () => {
    const token = await signToken(validClaims, { privateKey });
    const matchers: VercelOidcTokenMatcher[] = [
      { team: 'acme', project: 'acme_website', environment: 'preview' },
    ];
    expect(await isValidVercelOidcToken(matchers, token, { fetchJwks })).toBe(
      false
    );
  });

  test('matches by team ID and project ID', async () => {
    const token = await signToken(validClaims, { privateKey });
    expect(
      await isValidVercelOidcToken(
        { teamId: 'team_abc123', projectId: 'prj_abc123' },
        token,
        { fetchJwks }
      )
    ).toBe(true);
    expect(
      await isValidVercelOidcToken(
        { teamId: 'team_other', projectId: 'prj_abc123' },
        token,
        { fetchJwks }
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
        { fetchJwks }
      )
    ).toBe(true);
  });

  test('matches the aud claim', async () => {
    const token = await signToken(validClaims, { privateKey });
    expect(
      await isValidVercelOidcToken({ aud: 'https://vercel.com/acme' }, token, {
        fetchJwks,
      })
    ).toBe(true);
    expect(
      await isValidVercelOidcToken({ aud: 'https://vercel.com/other' }, token, {
        fetchJwks,
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
        { fetchJwks }
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
        { fetchJwks }
      )
    ).toBe(false);
    await expect(
      assertValidVercelOidcToken(
        { team: 'acme', project: 'acme_website', environment: 'production' },
        token,
        { fetchJwks }
      )
    ).rejects.toBeInstanceOf(UnacceptableVercelOidcTokenError);
  });

  test('rejects a token signed with a different key', async () => {
    const token = await signToken(validClaims, { privateKey: otherPrivateKey });
    expect(
      await isValidVercelOidcToken(
        { team: 'acme', project: 'acme_website', environment: 'production' },
        token,
        { fetchJwks }
      )
    ).toBe(false);
  });

  test('rejects a token with a tampered payload', async () => {
    const token = await signToken(validClaims, { privateKey });
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    const decoded = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    );
    decoded.environment = 'production';
    decoded.owner = 'attacker';
    const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString(
      'base64url'
    );
    const tampered = `${headerB64}.${tamperedPayload}.${signatureB64}`;
    expect(
      await isValidVercelOidcToken(
        { team: 'attacker', environment: 'production' },
        tampered,
        { fetchJwks }
      )
    ).toBe(false);
  });

  test('rejects a token with alg=none', async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT', kid: KID })
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        ...validClaims,
        iss: 'https://oidc.vercel.com',
        exp: Math.floor(Date.now() / 1000) + 60,
        iat: Math.floor(Date.now() / 1000),
      })
    ).toString('base64url');
    const unsigned = `${header}.${payload}.`;
    expect(
      await isValidVercelOidcToken(
        { team: 'acme', project: 'acme_website', environment: 'production' },
        unsigned,
        { fetchJwks }
      )
    ).toBe(false);
  });

  test('rejects a token with a non-RS256 algorithm', async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: KID })
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        ...validClaims,
        iss: 'https://oidc.vercel.com',
        exp: Math.floor(Date.now() / 1000) + 60,
      })
    ).toString('base64url');
    const fake = `${header}.${payload}.AAAA`;
    expect(
      await isValidVercelOidcToken(
        { team: 'acme', project: 'acme_website', environment: 'production' },
        fake,
        { fetchJwks }
      )
    ).toBe(false);
  });

  test('rejects a token from a non-Vercel issuer without fetching JWKS', async () => {
    let resolverCalled = false;
    const detectingFetcher: JwksFetcher = async issuer => {
      resolverCalled = true;
      return fetchJwks(issuer);
    };
    const token = await signToken(validClaims, {
      privateKey,
      issuer: 'https://attacker.example.com',
    });
    expect(
      await isValidVercelOidcToken(
        { team: 'acme', project: 'acme_website', environment: 'production' },
        token,
        { fetchJwks: detectingFetcher }
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
        { fetchJwks }
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
        { fetchJwks }
      )
    ).toBe(true);
  });

  test('rejects an empty token string', async () => {
    expect(
      await isValidVercelOidcToken({ team: 'acme' }, '', { fetchJwks })
    ).toBe(false);
    await expect(
      assertValidVercelOidcToken({ team: 'acme' }, '', { fetchJwks })
    ).rejects.toBeInstanceOf(UnacceptableVercelOidcTokenError);
  });

  test('rejects a malformed token', async () => {
    expect(
      await isValidVercelOidcToken({ team: 'acme' }, 'not-a-jwt', {
        fetchJwks,
      })
    ).toBe(false);
  });

  test('rejects when no matchers are provided', async () => {
    const token = await signToken(validClaims, { privateKey });
    expect(await isValidVercelOidcToken([], token, { fetchJwks })).toBe(false);
  });

  test('rejects when the kid is not found in the JWKS', async () => {
    const token = await signToken(validClaims, {
      privateKey,
      keyId: 'unknown-kid',
    });
    expect(
      await isValidVercelOidcToken(
        { team: 'acme', project: 'acme_website', environment: 'production' },
        token,
        { fetchJwks }
      )
    ).toBe(false);
  });

  test('UnacceptableVercelOidcTokenError preserves cause', async () => {
    const token = await signToken(validClaims, { privateKey });
    let error: unknown;
    try {
      await assertValidVercelOidcToken({ team: 'vercel' }, token, {
        fetchJwks,
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
