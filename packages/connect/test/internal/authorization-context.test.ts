import { getVercelOidcTokenSync } from '@vercel/oidc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractAuthorizationContextFromOidcToken,
  tryGetVercelAuthorizationContext,
  withAuthorizationContext,
} from '../../src/internal/authorization-context.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcTokenSync: vi.fn(),
}));

function createToken(claims: unknown): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${payload}.sig`;
}

describe('authorization context', () => {
  beforeEach(() => {
    vi.mocked(getVercelOidcTokenSync).mockReset();
  });

  it('reads the authorization context from the synchronous OIDC token', () => {
    vi.mocked(getVercelOidcTokenSync).mockReturnValue(
      createToken({
        owner_id: 'team_123',
        project_id: 'prj_123',
        environment: 'preview',
      })
    );

    expect(tryGetVercelAuthorizationContext()).toEqual({
      teamId: 'team_123',
      projectId: 'prj_123',
      environment: 'preview',
    });
    expect(getVercelOidcTokenSync).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when no OIDC token is available', () => {
    vi.mocked(getVercelOidcTokenSync).mockImplementation(() => {
      throw new Error('No OIDC token');
    });

    expect(tryGetVercelAuthorizationContext()).toBeUndefined();
  });

  it.each([
    'invalid',
    'header.!.sig',
    'header.bm90LWpzb24.sig',
    createToken(null),
  ])('returns undefined for malformed token %s', token => {
    expect(extractAuthorizationContextFromOidcToken(token)).toBeUndefined();
  });

  it.each([
    [{ owner_id: 'team_123' }, { teamId: 'team_123' }],
    [{ project_id: 'prj_123' }, { projectId: 'prj_123' }],
    [{ environment: 'preview' }, { environment: 'preview' }],
    [{ custom_environment_id: 'env_staging' }, { environment: 'env_staging' }],
    [{ owner_id: 123, project_id: false, environment: {} }, {}],
    [{ custom_environment_id: {}, environment: 'preview' }, {}],
    [{}, {}],
  ])('uses only available string claims from %j', (claims, expected) => {
    const context = extractAuthorizationContextFromOidcToken(
      createToken(claims)
    );

    expect(context).toEqual(expected);
    const url = new URL(
      withAuthorizationContext(
        'https://connect.vercel.com/oauth/authorize',
        context
      )
    );
    expect(Object.fromEntries(url.searchParams)).toEqual(expected);
  });

  it('preserves existing URL parameters and encodes context values', () => {
    const url = new URL(
      withAuthorizationContext(
        'https://connect.vercel.com/oauth/authorize?scope=openid',
        {
          teamId: 'team_123',
          projectId: 'prj_123',
          environment: 'staging&scope=admin',
        }
      )
    );

    expect(Object.fromEntries(url.searchParams)).toEqual({
      scope: 'openid',
      teamId: 'team_123',
      projectId: 'prj_123',
      environment: 'staging&scope=admin',
    });
  });

  it.each([
    undefined,
    {},
    { teamId: '', projectId: '', environment: '' },
  ])('leaves the URL unchanged when context is missing or empty: %j', context => {
    const baseUrl = 'https://connect.vercel.com/oauth/authorize';

    expect(withAuthorizationContext(baseUrl, context)).toBe(baseUrl);
  });
});
