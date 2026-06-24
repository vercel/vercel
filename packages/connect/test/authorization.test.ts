import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAuthorization } from '../src/authorization.js';

describe('startAuthorization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends prompt in the request body when specified', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          request: 'req_abc',
          verifier: 'verifier_xyz',
          url: 'https://connect.vercel.com/consent',
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await startAuthorization(
      'oauth/linear',
      { subject: { type: 'user', id: 'user_123' } },
      { prompt: 'consent', vercelToken: 'vercel_oidc_token' }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.vercel.com/v1/connect/authorize/oauth%2Flinear',
      expect.objectContaining({
        body: JSON.stringify({
          subject: { type: 'user', id: 'user_123' },
          prompt: 'consent',
        }),
      })
    );
  });
});
