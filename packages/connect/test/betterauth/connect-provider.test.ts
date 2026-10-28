import { getVercelOidcTokenSync } from '@vercel/oidc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connect } from '../../src/betterauth/connect-provider.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
  getVercelOidcTokenSync: vi.fn(),
}));

describe('Better Auth connect provider', () => {
  beforeEach(() => {
    vi.mocked(getVercelOidcTokenSync)
      .mockReset()
      .mockImplementation(() => {
        throw new Error('No OIDC token');
      });
  });

  it('requests OpenID profile and email scopes by default', () => {
    const provider = connect({
      providerId: 'linear',
      connector: 'oauth/linear',
    });

    expect(provider.authorizationUrl).toBe(
      'https://connect.vercel.com/oauth/authorize'
    );
    expect(provider.scopes).toEqual([
      'openid',
      'profile',
      'email',
      'offline_access',
    ]);
  });

  it.each([
    [undefined, 'production'],
    ['', 'production'],
    ['env_staging', 'env_staging'],
  ])('scopes authorization to the OIDC context with custom environment %s', (customEnvironmentId, environment) => {
    const payload = Buffer.from(
      JSON.stringify({
        owner_id: 'team_123',
        project_id: 'prj_123',
        environment: 'production',
        custom_environment_id: customEnvironmentId,
      })
    ).toString('base64url');
    vi.mocked(getVercelOidcTokenSync).mockReturnValue(`header.${payload}.sig`);

    const provider = connect({
      providerId: 'linear',
      connector: 'oauth/linear',
    });

    expect(provider.authorizationUrl).toBe(
      `https://connect.vercel.com/oauth/authorize?teamId=team_123&projectId=prj_123&environment=${environment}`
    );
  });
});
