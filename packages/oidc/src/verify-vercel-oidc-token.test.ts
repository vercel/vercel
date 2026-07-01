import { describe, afterEach, beforeEach, test, vi, expect } from 'vitest';
import { jwtVerify } from 'jose';
import { verifyVercelOidcToken } from './verify-vercel-oidc-token';

const mocks = vi.hoisted(() => {
  const remoteJwks = vi.fn();

  return {
    remoteJwks,
    createRemoteJWKSet: vi.fn(() => remoteJwks),
    jwtVerify: vi.fn(),
  };
});

vi.mock('jose', () => ({
  createRemoteJWKSet: mocks.createRemoteJWKSet,
  jwtVerify: mocks.jwtVerify,
}));

describe('verifyVercelOidcToken', () => {
  const verifyResult = {
    payload: {
      sub: 'owner:team1:project:site:environment:production',
      iss: 'https://oidc.vercel.com/team1',
      aud: 'https://oidc.vercel.com/team1',
      project_id: 'prj_test',
      environment: 'production',
      owner_id: 'team_team1',
    },
    protectedHeader: {
      alg: 'RS256',
    },
  };

  beforeEach(() => {
    process.env.VERCEL_PROJECT_ID = 'prj_test';
    process.env.VERCEL_TARGET_ENV = 'production';
    delete process.env.VERCEL_ENV;

    vi.mocked(jwtVerify).mockClear();
    mockVerifiedPayload();
  });

  afterEach(() => {
    delete process.env.VERCEL_PROJECT_ID;
    delete process.env.VERCEL_TARGET_ENV;
    delete process.env.VERCEL_ENV;
  });

  test('verifies a token using the Vercel issuer and JWKS', async () => {
    const result = await verifyVercelOidcToken('token', {
      audience: 'https://oidc.vercel.com/team1',
      subject: 'owner:team1:project:site:environment:production',
    });

    expect(result).toStrictEqual(verifyResult);
    expect(jwtVerify).toHaveBeenCalledWith('token', mocks.remoteJwks, {
      algorithms: ['RS256'],
      audience: 'https://oidc.vercel.com/team1',
      subject: 'owner:team1:project:site:environment:production',
    });
  });

  test('verifies a token without additional options', async () => {
    await verifyVercelOidcToken('token');

    expect(jwtVerify).toHaveBeenCalledWith('token', mocks.remoteJwks, {
      algorithms: ['RS256'],
    });
  });

  test('reuses the Vercel remote JWKS resolver', async () => {
    await verifyVercelOidcToken('first-token');
    await verifyVercelOidcToken('second-token');

    expect(mocks.createRemoteJWKSet).toHaveBeenCalledTimes(1);
    expect(jwtVerify).toHaveBeenCalledTimes(2);
  });

  test('passes custom algorithms to Jose verification', async () => {
    await verifyVercelOidcToken('token', {
      algorithms: ['RS512'],
    });

    expect(jwtVerify).toHaveBeenCalledWith('token', mocks.remoteJwks, {
      algorithms: ['RS512'],
    });
  });

  test('accepts a team issuer by default', async () => {
    await verifyVercelOidcToken('token');

    expect(jwtVerify).toHaveBeenCalledTimes(1);
  });

  test('accepts the global issuer', async () => {
    mockVerifiedPayload({
      iss: 'https://oidc.vercel.com',
    });

    await verifyVercelOidcToken('token');

    expect(jwtVerify).toHaveBeenCalledTimes(1);
  });

  test('accepts a matching explicit issuer option', async () => {
    mockVerifiedPayload({
      iss: 'https://oidc.vercel.com/acme',
    });

    await verifyVercelOidcToken('token', {
      issuer: 'https://oidc.vercel.com/acme',
    });

    expect(jwtVerify).toHaveBeenCalledTimes(1);
    expect(jwtVerify).toHaveBeenCalledWith('token', mocks.remoteJwks, {
      algorithms: ['RS256'],
      issuer: 'https://oidc.vercel.com/acme',
    });
  });

  test('uses VERCEL_ENV when VERCEL_TARGET_ENV is missing', async () => {
    delete process.env.VERCEL_TARGET_ENV;
    process.env.VERCEL_ENV = 'production';

    await verifyVercelOidcToken('token');

    expect(jwtVerify).toHaveBeenCalledTimes(1);
  });

  test('accepts custom projectId and environment options', async () => {
    mockVerifiedPayload({
      project_id: 'prj_custom',
      environment: 'preview',
    });

    const result = await verifyVercelOidcToken('token', {
      projectId: 'prj_custom',
      environment: 'preview',
    });

    expect(result.payload.project_id).toBe('prj_custom');
    expect(result.payload.environment).toBe('preview');
  });

  test('accepts a matching projectId array option', async () => {
    mockVerifiedPayload({
      project_id: 'prj_allowed',
    });

    const result = await verifyVercelOidcToken('token', {
      projectId: ['prj_first', 'prj_allowed'],
    });

    expect(result.payload.project_id).toBe('prj_allowed');
  });

  test('accepts a matching ownerId option', async () => {
    const result = await verifyVercelOidcToken('token', {
      ownerId: 'team_team1',
    });

    expect(result.payload.owner_id).toBe('team_team1');
  });

  test('does not require ownerId by default', async () => {
    mockVerifiedPayload({
      owner_id: 'team_other',
    });

    await verifyVercelOidcToken('token');

    expect(jwtVerify).toHaveBeenCalledTimes(1);
  });

  test('allows any project_id claim with projectId wildcard', async () => {
    mockVerifiedPayload({
      project_id: 'prj_other',
    });

    await verifyVercelOidcToken('token', {
      projectId: '*',
      ownerId: 'team_team1',
    });

    expect(jwtVerify).toHaveBeenCalledTimes(1);
  });

  test('allows projectId wildcard with audience verification', async () => {
    mockVerifiedPayload({
      project_id: 'prj_other',
    });

    await verifyVercelOidcToken('token', {
      projectId: '*',
      audience: 'https://oidc.vercel.com/team1',
    });

    expect(jwtVerify).toHaveBeenCalledWith('token', mocks.remoteJwks, {
      algorithms: ['RS256'],
      audience: 'https://oidc.vercel.com/team1',
    });
  });

  test('requires ownerId or audience when projectId wildcard is used', async () => {
    await expect(
      verifyVercelOidcToken('token', {
        projectId: '*',
      })
    ).rejects.toThrow(
      "Expected ownerId or audience to be provided when projectId is '*'."
    );
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  test('requires ownerId or a non-empty audience when projectId wildcard is used', async () => {
    await expect(
      verifyVercelOidcToken('token', {
        projectId: '*',
        audience: [],
      })
    ).rejects.toThrow(
      "Expected ownerId or audience to be provided when projectId is '*'."
    );
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  test('allows any environment claim with environment wildcard', async () => {
    mockVerifiedPayload({
      environment: 'preview',
    });

    await verifyVercelOidcToken('token', {
      environment: '*',
    });

    expect(jwtVerify).toHaveBeenCalledTimes(1);
  });

  test('accepts a matching environment array option', async () => {
    mockVerifiedPayload({
      environment: 'preview',
    });

    const result = await verifyVercelOidcToken('token', {
      environment: ['production', 'preview'],
    });

    expect(result.payload.environment).toBe('preview');
  });

  test('rejects a token from a different project', async () => {
    mockVerifiedPayload({
      project_id: 'prj_other',
    });

    await expect(verifyVercelOidcToken('token')).rejects.toThrow(
      'Expected Vercel OIDC token project_id claim to be "prj_test".'
    );
  });

  test('rejects a token from a project outside the projectId array', async () => {
    mockVerifiedPayload({
      project_id: 'prj_other',
    });

    await expect(
      verifyVercelOidcToken('token', {
        projectId: ['prj_first', 'prj_second'],
      })
    ).rejects.toThrow(
      'Expected Vercel OIDC token project_id claim to be one of: "prj_first", "prj_second".'
    );
  });

  test('requires a non-empty projectId array', async () => {
    await expect(
      verifyVercelOidcToken('token', {
        projectId: [],
      })
    ).rejects.toThrow(
      "Expected VERCEL_PROJECT_ID to be set or projectId to be provided. Pass projectId: '*' to allow any project_id claim."
    );
  });

  test('rejects a token from a different owner', async () => {
    mockVerifiedPayload({
      owner_id: 'team_other',
    });

    await expect(
      verifyVercelOidcToken('token', {
        ownerId: 'team_team1',
      })
    ).rejects.toThrow(
      'Expected Vercel OIDC token owner_id claim to be "team_team1".'
    );
  });

  test('rejects a token from a non-Vercel issuer', async () => {
    mockVerifiedPayload({
      iss: 'https://example.com',
    });

    await expect(verifyVercelOidcToken('token')).rejects.toThrow(
      'Expected Vercel OIDC token iss claim to be "https://oidc.vercel.com" or to start with "https://oidc.vercel.com/".'
    );
  });

  test('passes explicit issuer option to Jose verification', async () => {
    await verifyVercelOidcToken('token', {
      issuer: 'https://oidc.vercel.com/other-team',
    });

    expect(jwtVerify).toHaveBeenCalledWith('token', mocks.remoteJwks, {
      algorithms: ['RS256'],
      issuer: 'https://oidc.vercel.com/other-team',
    });
  });

  test('rejects a token from an issuer that only shares the prefix text', async () => {
    mockVerifiedPayload({
      iss: 'https://oidc.vercel.com.evil.example',
    });

    await expect(verifyVercelOidcToken('token')).rejects.toThrow(
      'Expected Vercel OIDC token iss claim to be "https://oidc.vercel.com" or to start with "https://oidc.vercel.com/".'
    );
  });

  test('rejects a token from a different environment', async () => {
    mockVerifiedPayload({
      environment: 'preview',
    });

    await expect(verifyVercelOidcToken('token')).rejects.toThrow(
      'Expected Vercel OIDC token environment claim to be "production".'
    );
  });

  test('rejects a token from an environment outside the environment array', async () => {
    mockVerifiedPayload({
      environment: 'preview',
    });

    await expect(
      verifyVercelOidcToken('token', {
        environment: ['production', 'development'],
      })
    ).rejects.toThrow(
      'Expected Vercel OIDC token environment claim to be one of: "production", "development".'
    );
  });

  test('requires a projectId default or wildcard', async () => {
    delete process.env.VERCEL_PROJECT_ID;

    await expect(verifyVercelOidcToken('token')).rejects.toThrow(
      "Expected VERCEL_PROJECT_ID to be set or projectId to be provided. Pass projectId: '*' to allow any project_id claim."
    );
  });

  test('requires an environment default or wildcard', async () => {
    delete process.env.VERCEL_TARGET_ENV;
    delete process.env.VERCEL_ENV;

    await expect(verifyVercelOidcToken('token')).rejects.toThrow(
      "Expected VERCEL_TARGET_ENV or VERCEL_ENV to be set or environment to be provided. Pass environment: '*' to allow any environment claim."
    );
  });

  test('requires a non-empty environment array', async () => {
    await expect(
      verifyVercelOidcToken('token', {
        environment: [],
      })
    ).rejects.toThrow(
      "Expected VERCEL_TARGET_ENV or VERCEL_ENV to be set or environment to be provided. Pass environment: '*' to allow any environment claim."
    );
  });

  function mockVerifiedPayload(
    payload?: Partial<typeof verifyResult.payload>
  ): void {
    vi.mocked(jwtVerify).mockResolvedValue({
      ...verifyResult,
      payload: {
        ...verifyResult.payload,
        ...payload,
      },
    } as unknown as Awaited<ReturnType<typeof jwtVerify>>);
  }
});
