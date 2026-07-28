import { getVercelOidcToken } from '@vercel/oidc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { experimental_startInstallation } from '../src/installation.js';
import { ConnectError } from '../src/token.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
}));

const CONNECTOR = 'oauth/linear';

describe('experimental_startInstallation', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(getVercelOidcToken).mockResolvedValue('oidc_token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates an installation request', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        request: 'sci_123',
        verifier: 'verifier_123',
        url: 'https://connect.vercel.com/install/sci_123',
        expiresAt: 123456789,
        connector: {
          id: 'scl_123',
          uid: 'oauth/linear',
          type: 'oauth',
          service: 'linear',
          serviceName: 'Linear',
          name: 'Linear',
        },
      })
    );

    await expect(
      experimental_startInstallation(
        CONNECTOR,
        {
          resources: ['workspace:acme'],
          installationId: 'linear-installation',
        },
        {
          vercelToken: 'vercel_token',
          returnUrl: 'https://example.com/connect/install/return',
          webhook: 'https://example.com/connect/install/webhook',
          tenantId: 'tenant_123',
          deviceCode: true,
          expiresInMs: 60 * 60 * 1000,
        }
      )
    ).resolves.toMatchObject({
      request: 'sci_123',
      verifier: 'verifier_123',
      url: 'https://connect.vercel.com/install/sci_123',
    });

    expect(getVercelOidcToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.vercel.com/v1/connect/install/oauth%2Flinear'
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer vercel_token',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      resources: ['workspace:acme'],
      installationId: 'linear-installation',
      returnUrl: 'https://example.com/connect/install/return',
      webhook: 'https://example.com/connect/install/webhook',
      tenantId: 'tenant_123',
      deviceCode: true,
      expiresInMs: 60 * 60 * 1000,
    });
  });

  it('uses the Vercel OIDC token when no explicit token is provided', async () => {
    fetchMock.mockResolvedValueOnce(installationResponse());

    await experimental_startInstallation(CONNECTOR);

    expect(getVercelOidcToken).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer oidc_token',
    });
  });

  it('uses detached device authorization when requested by environment', async () => {
    vi.stubEnv('VERCEL_CONNECT_INTERACTIVE_AUTH_MODE', 'detached');
    fetchMock.mockResolvedValueOnce(
      installationResponse({ deviceCode: 'ABC123' })
    );

    await expect(
      experimental_startInstallation(CONNECTOR, undefined, {
        returnUrl: 'http://example.com/connect/install/return',
      })
    ).resolves.toMatchObject({
      deviceCode: 'ABC123',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      deviceCode: true,
    });
  });

  it('rejects non-local http return URLs', async () => {
    await expect(
      experimental_startInstallation(CONNECTOR, undefined, {
        returnUrl: 'http://example.com/connect/install/return',
      })
    ).rejects.toThrow(
      'returnUrl must be https://, http://localhost, or http://*.localhost'
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps API errors through ConnectError', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: 'forbidden',
            message: 'Missing permission to install connector',
          },
        },
        { status: 403, statusText: 'Forbidden' }
      )
    );

    const promise = experimental_startInstallation(CONNECTOR);

    await expect(promise).rejects.toBeInstanceOf(ConnectError);
    await expect(promise).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
      statusText: 'Forbidden',
      message: 'Missing permission to install connector',
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

function installationResponse(
  overrides: Partial<{
    deviceCode: string;
  }> = {}
): Response {
  return jsonResponse({
    request: 'sci_123',
    verifier: 'verifier_123',
    url: 'https://connect.vercel.com/install/sci_123',
    expiresAt: Date.now() + 60 * 60 * 1000,
    connector: {
      id: 'scl_123',
      uid: 'oauth/linear',
      type: 'oauth',
      name: 'Linear',
    },
    ...overrides,
  });
}
