import { getVercelOidcToken } from '@vercel/oidc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startAuthorization } from '../src/authorization.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
}));

const CONNECTOR = 'oauth/linear';
const PARAMS = {
  subject: { type: 'user' as const, id: 'user_123' },
};

describe('startAuthorization', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(getVercelOidcToken).mockResolvedValue('oidc_token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('accepts localhost subdomains as local callback URLs', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        request: 'req_123',
        verifier: 'verifier_123',
        url: 'https://connect.vercel.com/authorize/req_123',
      })
    );

    await expect(
      startAuthorization(CONNECTOR, PARAMS, {
        callbackUrl:
          'http://agent.localhost:3000/eve/v1/authorization/callback',
      })
    ).resolves.toMatchObject({
      request: 'req_123',
      verifier: 'verifier_123',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.vercel.com/v1/connect/authorize/oauth%2Flinear'
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      returnUrl: 'http://agent.localhost:3000/eve/v1/authorization/callback',
    });
  });

  it('rejects non-local http callback URLs', async () => {
    await expect(
      startAuthorization(CONNECTOR, PARAMS, {
        callbackUrl: 'http://example.com/eve/v1/authorization/callback',
      })
    ).rejects.toThrow(
      'callbackUrl must be https://, http://localhost, or http://*.localhost'
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a Passport token for a Passport subject', async () => {
    await expect(
      startAuthorization(CONNECTOR, { subject: { type: 'passport' } })
    ).rejects.toThrow(
      'passportToken is required when subject.type is "passport"'
    );

    expect(getVercelOidcToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends Passport identity alongside project OIDC', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        request: 'req_passport',
        verifier: 'verifier_passport',
        url: 'https://connect.vercel.com/authorize/req_passport',
      })
    );

    await startAuthorization(
      CONNECTOR,
      { subject: { type: 'passport' } },
      {
        vercelToken: 'project_oidc',
        passportToken: 'verified_passport_token',
        passportResource: 'owner:team_1:project:prj_1:sandbox:sbx_1:host:vm',
      }
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer project_oidc',
      'x-vercel-oidc-passport-token': 'verified_passport_token',
      'x-vercel-passport-resource':
        'owner:team_1:project:prj_1:sandbox:sbx_1:host:vm',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      subject: { type: 'passport' },
    });
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}
