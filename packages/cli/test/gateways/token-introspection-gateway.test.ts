import { describe, expect, it } from 'vitest';
import { liveTokenIntrospectionGateway } from '../../src/gateways/token-introspection-gateway';
import { FakeTokenIntrospectionGateway } from '../fakes/fake-token-introspection-gateway';

describe('liveTokenIntrospectionGateway', () => {
  it('refuses custom API origins', async () => {
    const gateway = liveTokenIntrospectionGateway({
      apiUrl: 'http://127.0.0.1:3000',
    });

    const result = await gateway.introspect({ token: 'tok_1' });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'unsupported_api_origin',
        message: 'Token introspection is unavailable for custom API origins',
      },
    });
  });

  it('refuses an empty token', async () => {
    const gateway = liveTokenIntrospectionGateway({
      apiUrl: 'https://api.vercel.com',
    });

    const result = await gateway.introspect({ token: '' });

    expect(result).toMatchObject({ ok: false, error: { code: 'no_token' } });
  });
});

describe('FakeTokenIntrospectionGateway', () => {
  const response = {
    active: true,
    client_id: 'app_1',
    team: { id: 'team_1', slug: 'acme' },
  };

  it('returns the response for a known token', async () => {
    const gateway = new FakeTokenIntrospectionGateway({
      tokens: { tok_app: response },
    });

    await expect(gateway.introspect({ token: 'tok_app' })).resolves.toEqual({
      ok: true,
      value: response,
    });
  });

  it('fails for an unknown token', async () => {
    const gateway = new FakeTokenIntrospectionGateway();

    await expect(
      gateway.introspect({ token: 'tok_unknown' })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'introspection_failed' },
    });
  });

  it('refuses an empty token', async () => {
    const gateway = new FakeTokenIntrospectionGateway();

    await expect(gateway.introspect({ token: '' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'no_token' },
    });
  });
});
