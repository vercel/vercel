import { describe, test, expect, beforeEach, beforeAll } from 'vitest';
import {
  SignJWT,
  generateKeyPair,
  exportJWK,
  type JWK,
  type KeyLike,
} from 'jose';
import {
  decodeJwt,
  findJwksKey,
  verifyRs256Signature,
  _resetJwksCacheForTesting,
  type Jwks,
  type JwksFetcher,
  type PublicJsonWebKey,
} from './jwt';

const ISSUER = 'https://oidc.example.test/jwt-test';
const KID_A = 'key-a';
const KID_B = 'key-b';

function toJwk(jwk: JWK, kid: string): PublicJsonWebKey {
  return { ...jwk, kid, alg: 'RS256', use: 'sig' } as PublicJsonWebKey;
}

describe('decodeJwt', () => {
  let privateKey: KeyLike;

  beforeAll(async () => {
    const kp = await generateKeyPair('RS256', { extractable: true });
    privateKey = kp.privateKey;
  });

  test('decodes a well-formed JWT', async () => {
    const token = await new SignJWT({ foo: 'bar' })
      .setProtectedHeader({ alg: 'RS256', kid: KID_A, typ: 'JWT' })
      .setIssuer('https://example.test')
      .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
      .sign(privateKey);

    const decoded = decodeJwt(token);
    expect(decoded.header.alg).toBe('RS256');
    expect(decoded.header.kid).toBe(KID_A);
    expect(decoded.payload.foo).toBe('bar');
    expect(decoded.payload.iss).toBe('https://example.test');
    expect(decoded.signature.byteLength).toBeGreaterThan(0);
    expect(decoded.signedData.byteLength).toBeGreaterThan(0);
  });

  test('throws on a token with the wrong number of segments', () => {
    expect(() => decodeJwt('a.b')).toThrow(/three dot-separated/);
    expect(() => decodeJwt('a.b.c.d')).toThrow(/three dot-separated/);
  });

  test('throws when header or payload is not valid base64url JSON', () => {
    const bad = 'aGVsbG8.aGVsbG8.aGVsbG8';
    expect(() => decodeJwt(bad)).toThrow(/base64url JSON/);
  });
});

describe('verifyRs256Signature', () => {
  let privateKey: KeyLike;
  let publicJwk: PublicJsonWebKey;
  let otherPublicJwk: PublicJsonWebKey;

  beforeAll(async () => {
    const kp = await generateKeyPair('RS256', { extractable: true });
    privateKey = kp.privateKey;
    publicJwk = toJwk(await exportJWK(kp.publicKey), KID_A);
    const other = await generateKeyPair('RS256', { extractable: true });
    otherPublicJwk = toJwk(await exportJWK(other.publicKey), 'other');
  });

  test('returns true for a valid signature', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: KID_A, typ: 'JWT' })
      .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
      .sign(privateKey);
    const decoded = decodeJwt(token);
    expect(
      await verifyRs256Signature(
        publicJwk,
        decoded.signedData,
        decoded.signature
      )
    ).toBe(true);
  });

  test('returns false for a signature signed with a different key', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: KID_A, typ: 'JWT' })
      .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
      .sign(privateKey);
    const decoded = decodeJwt(token);
    expect(
      await verifyRs256Signature(
        otherPublicJwk,
        decoded.signedData,
        decoded.signature
      )
    ).toBe(false);
  });

  test('throws for a non-RSA JWK', async () => {
    const ecJwk: PublicJsonWebKey = {
      kty: 'EC',
      crv: 'P-256',
      x: 'AAA',
      y: 'AAA',
    };
    await expect(
      verifyRs256Signature(ecJwk, new Uint8Array(), new Uint8Array())
    ).rejects.toThrow(/expected "RSA"/);
  });

  test('throws for a JWK with a non-RS256 alg', async () => {
    const badJwk: PublicJsonWebKey = { ...publicJwk, alg: 'RS512' };
    await expect(
      verifyRs256Signature(badJwk, new Uint8Array(), new Uint8Array())
    ).rejects.toThrow(/expected "RS256"/);
  });
});

describe('findJwksKey', () => {
  let publicJwkA: PublicJsonWebKey;
  let publicJwkB: PublicJsonWebKey;

  beforeAll(async () => {
    const kp1 = await generateKeyPair('RS256', { extractable: true });
    publicJwkA = toJwk(await exportJWK(kp1.publicKey), KID_A);
    const kp2 = await generateKeyPair('RS256', { extractable: true });
    publicJwkB = toJwk(await exportJWK(kp2.publicKey), KID_B);
  });

  beforeEach(() => {
    _resetJwksCacheForTesting();
  });

  test('returns the matching key', async () => {
    const fetcher: JwksFetcher = async () => ({ keys: [publicJwkA] });
    expect(await findJwksKey(ISSUER, KID_A, fetcher)).toMatchObject({
      kid: KID_A,
    });
  });

  test('returns null when no key matches the kid even after a refresh', async () => {
    let calls = 0;
    const fetcher: JwksFetcher = async () => {
      calls++;
      return { keys: [publicJwkA] };
    };
    expect(await findJwksKey(ISSUER, 'missing', fetcher)).toBeNull();
    expect(calls).toBe(2); // initial fetch + one forced refresh
  });

  test('caches successful fetches across calls within the TTL', async () => {
    let calls = 0;
    const fetcher: JwksFetcher = async () => {
      calls++;
      return { keys: [publicJwkA] };
    };
    await findJwksKey(ISSUER, KID_A, fetcher);
    await findJwksKey(ISSUER, KID_A, fetcher);
    await findJwksKey(ISSUER, KID_A, fetcher);
    expect(calls).toBe(1);
  });

  test('forces a refresh when the cached set does not contain the kid', async () => {
    let callCount = 0;
    const responses: Jwks[] = [
      { keys: [publicJwkA] },
      { keys: [publicJwkA, publicJwkB] },
    ];
    const fetcher: JwksFetcher = async () => responses[callCount++]!;

    expect(await findJwksKey(ISSUER, KID_A, fetcher)).toMatchObject({
      kid: KID_A,
    });
    expect(callCount).toBe(1);

    expect(await findJwksKey(ISSUER, KID_B, fetcher)).toMatchObject({
      kid: KID_B,
    });
    expect(callCount).toBe(2);
  });

  test('rate-limits forced refreshes', async () => {
    let callCount = 0;
    const fetcher: JwksFetcher = async () => {
      callCount++;
      return { keys: [publicJwkA] };
    };
    await findJwksKey(ISSUER, 'missing-1', fetcher);
    expect(callCount).toBe(2);
    await findJwksKey(ISSUER, 'missing-2', fetcher);
    // Second lookup of an unknown kid should not trigger another forced fetch
    // because the rate-limit window has not elapsed.
    expect(callCount).toBe(2);
  });

  test('propagates fetcher errors', async () => {
    const fetcher: JwksFetcher = async () => {
      throw new Error('network down');
    };
    await expect(findJwksKey(ISSUER, KID_A, fetcher)).rejects.toThrow(
      /network down/
    );
  });
});
