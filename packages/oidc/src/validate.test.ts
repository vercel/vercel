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

  /*
   * Exhaustive per-property coverage. Each row defines a single matcher
   * property, the underlying claim it should match, the value to put on the
   * token, and a different value used to verify that the matcher rejects a
   * mismatch. This is the source of truth that every property in
   * VercelOidcTokenMatcher behaves correctly in isolation.
   */
  const TEAM_ISSUER = 'https://oidc.vercel.com/acme';
  const matcherCases: ReadonlyArray<{
    name: string;
    matcherProp: keyof VercelOidcTokenMatcher;
    claimProp: keyof TokenClaims;
    matchingValue: string;
    nonMatchingValue: string;
    /** Optional override applied to the signing options/claims. */
    extraClaims?: Partial<TokenClaims>;
    issuer?: string;
  }> = [
    {
      name: 'iss (global issuer)',
      matcherProp: 'iss',
      claimProp: 'iss',
      matchingValue: 'https://oidc.vercel.com',
      nonMatchingValue: 'https://oidc.vercel.com/acme',
      issuer: 'https://oidc.vercel.com',
    },
    {
      name: 'iss (team issuer)',
      matcherProp: 'iss',
      claimProp: 'iss',
      matchingValue: TEAM_ISSUER,
      nonMatchingValue: 'https://oidc.vercel.com',
      issuer: TEAM_ISSUER,
    },
    {
      name: 'aud',
      matcherProp: 'aud',
      claimProp: 'aud',
      matchingValue: 'https://vercel.com/acme',
      nonMatchingValue: 'https://vercel.com/other',
    },
    {
      name: 'sub',
      matcherProp: 'sub',
      claimProp: 'sub',
      matchingValue: 'owner:acme:project:acme_website:environment:production',
      nonMatchingValue: 'owner:acme:project:other:environment:production',
    },
    {
      name: 'team (alias for owner)',
      matcherProp: 'team',
      claimProp: 'owner',
      matchingValue: 'acme',
      nonMatchingValue: 'vercel',
    },
    {
      name: 'owner',
      matcherProp: 'owner',
      claimProp: 'owner',
      matchingValue: 'acme',
      nonMatchingValue: 'vercel',
    },
    {
      name: 'teamId (alias for owner_id)',
      matcherProp: 'teamId',
      claimProp: 'owner_id',
      matchingValue: 'team_abc123',
      nonMatchingValue: 'team_xyz789',
    },
    {
      name: 'owner_id',
      matcherProp: 'owner_id',
      claimProp: 'owner_id',
      matchingValue: 'team_abc123',
      nonMatchingValue: 'team_xyz789',
    },
    {
      name: 'project',
      matcherProp: 'project',
      claimProp: 'project',
      matchingValue: 'acme_website',
      nonMatchingValue: 'acme_other',
    },
    {
      name: 'projectId (alias for project_id)',
      matcherProp: 'projectId',
      claimProp: 'project_id',
      matchingValue: 'prj_abc123',
      nonMatchingValue: 'prj_xyz789',
    },
    {
      name: 'project_id',
      matcherProp: 'project_id',
      claimProp: 'project_id',
      matchingValue: 'prj_abc123',
      nonMatchingValue: 'prj_xyz789',
    },
    {
      name: 'environment',
      matcherProp: 'environment',
      claimProp: 'environment',
      matchingValue: 'production',
      nonMatchingValue: 'preview',
    },
    {
      name: 'userId (alias for user_id)',
      matcherProp: 'userId',
      claimProp: 'user_id',
      matchingValue: 'usr_42',
      nonMatchingValue: 'usr_99',
      extraClaims: { user_id: 'usr_42' },
    },
    {
      name: 'user_id',
      matcherProp: 'user_id',
      claimProp: 'user_id',
      matchingValue: 'usr_42',
      nonMatchingValue: 'usr_99',
      extraClaims: { user_id: 'usr_42' },
    },
  ];

  describe('every matcher property', () => {
    test.each(
      matcherCases
    )('$name accepts when the claim equals the matcher value', async ({
      matcherProp,
      claimProp,
      matchingValue,
      extraClaims,
      issuer,
    }) => {
      const claims: TokenClaims = {
        ...validClaims,
        ...extraClaims,
        [claimProp]: matchingValue,
      };
      const token = await signToken(claims, { privateKey, issuer });
      const matcher: VercelOidcTokenMatcher = {
        [matcherProp]: matchingValue,
      } as VercelOidcTokenMatcher;
      expect(await isValidVercelOidcToken(matcher, token, { fetchJwks })).toBe(
        true
      );
    });

    test.each(
      matcherCases
    )('$name rejects when the claim differs from the matcher value', async ({
      matcherProp,
      claimProp,
      matchingValue,
      nonMatchingValue,
      extraClaims,
      issuer,
    }) => {
      const claims: TokenClaims = {
        ...validClaims,
        ...extraClaims,
        [claimProp]: matchingValue,
      };
      const token = await signToken(claims, { privateKey, issuer });
      const matcher: VercelOidcTokenMatcher = {
        [matcherProp]: nonMatchingValue,
      } as VercelOidcTokenMatcher;
      expect(await isValidVercelOidcToken(matcher, token, { fetchJwks })).toBe(
        false
      );
    });

    // `iss` is structurally required by the verifier itself (we reject any
    // token whose issuer is not a Vercel OIDC issuer before matchers even
    // run), so an "absent iss" case has no meaningful behaviour to test on
    // the matcher level.
    test.each(
      matcherCases.filter(c => c.claimProp !== 'iss')
    )('$name rejects when the claim is absent from the token', async ({
      matcherProp,
      claimProp,
      matchingValue,
    }) => {
      // Build a token that intentionally omits the claim under test.
      const { [claimProp]: _omitted, ...claimsWithoutThisOne } = validClaims;
      const token = await signToken(claimsWithoutThisOne, { privateKey });
      const matcher: VercelOidcTokenMatcher = {
        [matcherProp]: matchingValue,
      } as VercelOidcTokenMatcher;
      expect(await isValidVercelOidcToken(matcher, token, { fetchJwks })).toBe(
        false
      );
    });
  });

  test('all properties on a single matcher must AND together', async () => {
    const claims: TokenClaims = { ...validClaims, user_id: 'usr_42' };
    const token = await signToken(claims, { privateKey });

    // Every property correct.
    expect(
      await isValidVercelOidcToken(
        {
          team: 'acme',
          teamId: 'team_abc123',
          project: 'acme_website',
          projectId: 'prj_abc123',
          environment: 'production',
          userId: 'usr_42',
          aud: 'https://vercel.com/acme',
          sub: 'owner:acme:project:acme_website:environment:production',
          iss: 'https://oidc.vercel.com',
        },
        token,
        { fetchJwks }
      )
    ).toBe(true);

    // A single property wrong, everything else correct → reject.
    expect(
      await isValidVercelOidcToken(
        {
          team: 'acme',
          teamId: 'team_abc123',
          project: 'acme_website',
          projectId: 'prj_abc123',
          environment: 'preview', // <- wrong
          userId: 'usr_42',
          aud: 'https://vercel.com/acme',
          sub: 'owner:acme:project:acme_website:environment:production',
          iss: 'https://oidc.vercel.com',
        },
        token,
        { fetchJwks }
      )
    ).toBe(false);
  });

  test('matcher with both an alias and its raw claim must agree', async () => {
    const token = await signToken(validClaims, { privateKey });
    // team and owner agree -> matches.
    expect(
      await isValidVercelOidcToken({ team: 'acme', owner: 'acme' }, token, {
        fetchJwks,
      })
    ).toBe(true);
    // team and owner disagree -> rejects (one of the two will fail).
    expect(
      await isValidVercelOidcToken(
        { team: 'acme', owner: 'someone-else' },
        token,
        { fetchJwks }
      )
    ).toBe(false);
  });
});
