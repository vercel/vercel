import { beforeEach, describe, expect, it, vi } from 'vitest';
import { liveTokenIntrospectionGateway } from '../../src/gateways/token-introspection-gateway';
import { introspectToken } from '../../src/util/introspect-token';

// Never reach the real OAuth introspection endpoint.
vi.mock('../../src/util/introspect-token', () => ({
  introspectToken: vi.fn(),
}));

const apiUrl = 'https://api.vercel.com';

describe('liveTokenIntrospectionGateway (mocked introspection)', () => {
  beforeEach(() => {
    vi.mocked(introspectToken).mockReset();
  });

  it('passes the token and API URL and returns the response', async () => {
    const response = { active: true as const, client_id: 'app_1' };
    vi.mocked(introspectToken).mockResolvedValue(response);

    const result = await liveTokenIntrospectionGateway({ apiUrl }).introspect({
      token: 'tok_1',
    });

    expect(result).toEqual({ ok: true, value: response });
    expect(introspectToken).toHaveBeenCalledWith({
      authConfig: { token: 'tok_1' },
      apiUrl,
    });
  });

  it.each([
    'no_token',
    'unsupported_api_origin',
  ])('keeps the %s error code', async code => {
    const cause = Object.assign(new Error('refused'), { code });
    vi.mocked(introspectToken).mockRejectedValue(cause);

    const result = await liveTokenIntrospectionGateway({
      apiUrl,
    }).introspect({ token: 'tok_1' });

    expect(result).toEqual({
      ok: false,
      error: { code, message: 'refused', details: { cause } },
    });
  });

  it.each([
    [
      'an errno error',
      Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
    ],
    ['a plain error', new Error('invalid response')],
  ])('maps %s to introspection_failed', async (_name, cause) => {
    vi.mocked(introspectToken).mockRejectedValue(cause);

    const result = await liveTokenIntrospectionGateway({ apiUrl }).introspect({
      token: 'tok_1',
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'introspection_failed', details: { cause } },
    });
  });
});
