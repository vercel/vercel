import { customFetch } from '@auth/core';
import { getVercelOidcTokenSync } from '@vercel/oidc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect } from '../../src/authjs/connect-provider.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
  getVercelOidcTokenSync: vi.fn(),
}));

describe('Auth.js connect provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the Auth.js custom fetch hook for token requests', async () => {
    const response = new Response('{}');
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    const provider = connect({
      id: 'linear',
      name: 'Linear',
      connector: 'oauth/linear',
      getVercelOidcToken: async () => 'test-token',
    });

    const result = await provider[customFetch]!(
      'https://connect.vercel.com/oauth/token',
      { method: 'POST' }
    );

    expect(result).toBe(response);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://connect.vercel.com/oauth/token',
      expect.objectContaining({ method: 'POST' })
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('authorization')).toBe(
      `Basic ${btoa('oauth%2Flinear:test-token')}`
    );
  });

  beforeEach(() => {
    vi.mocked(getVercelOidcTokenSync)
      .mockReset()
      .mockImplementation(() => {
        throw new Error('No OIDC token');
      });
  });

  it('requests OpenID profile and email scopes by default', () => {
    const provider = connect({
      id: 'linear',
      name: 'Linear',
      connector: 'oauth/linear',
    });

    expect(provider.authorization).toMatchObject({
      url: 'https://connect.vercel.com/oauth/authorize',
      params: {
        scope: 'openid profile email offline_access',
      },
    });
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
      id: 'linear',
      name: 'Linear',
      connector: 'oauth/linear',
    });

    expect(provider.authorization).toMatchObject({
      url: `https://connect.vercel.com/oauth/authorize?teamId=team_123&projectId=prj_123&environment=${environment}`,
    });
  });
});
