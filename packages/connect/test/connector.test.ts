import { getVercelOidcToken } from '@vercel/oidc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectError, getConnectorMetadata } from '../src/index.js';

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(),
}));

const CONNECTOR = {
  id: 'scl_abc123',
  uid: 'snowflake/analytics',
  name: 'Analytics Warehouse',
  type: 'snowflake',
  service: 'snowflake',
  clientUrl: 'https://ACME-XY123.snowflakecomputing.com',
  createdAt: 1000,
  updatedAt: 2000,
  data: {
    accountIdentifier: 'ACME-XY123',
    defaultSessionRole: 'REPORTER',
  },
};

describe('getConnectorMetadata', () => {
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

  it('fetches connector metadata with the explicit Vercel token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CONNECTOR));

    const connector = await getConnectorMetadata('snowflake/analytics', {
      vercelToken: 'vercel_token',
    });

    expect(getVercelOidcToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.vercel.com/v1/connect/connectors/snowflake%2Fanalytics'
    );
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer vercel_token',
    });
    expect(connector.id).toBe('scl_abc123');
    expect(connector.clientUrl).toBe(
      'https://ACME-XY123.snowflakecomputing.com'
    );
  });

  it('uses the Vercel OIDC token when no explicit token is provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CONNECTOR));

    await getConnectorMetadata('snowflake/analytics');

    expect(getVercelOidcToken).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer oidc_token'
    );
  });

  it('surfaces the wire `data` field as `vendor`', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CONNECTOR));

    const connector = await getConnectorMetadata('snowflake/analytics');

    expect(connector.service).toBe('snowflake');
    expect(connector.vendor.accountIdentifier).toBe('ACME-XY123');
    expect(connector.vendor.defaultSessionRole).toBe('REPORTER');
    expect('data' in connector).toBe(false);
  });

  it('throws a ConnectError on a non-ok response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'not_found' } }, { status: 404 })
    );

    await expect(getConnectorMetadata('scl_missing')).rejects.toBeInstanceOf(
      ConnectError
    );
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}
