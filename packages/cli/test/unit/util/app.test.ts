import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../mocks/client';
import {
  resolveAppFromToken,
  resolveAppTokenScope,
} from '../../../src/util/app';
import { introspectToken } from '../../../src/util/introspect-token';

vi.mock('../../../src/util/introspect-token', () => ({
  introspectToken: vi.fn(),
}));

const introspectTokenMock = vi.mocked(introspectToken);

afterEach(() => {
  introspectTokenMock.mockReset();
});

describe('resolveAppFromToken', () => {
  it('returns the app for an active token with a client', () => {
    expect(
      resolveAppFromToken({
        active: true,
        client_id: 'app_dummy',
        client_name: 'Dummy App',
      })
    ).toEqual({ id: 'app_dummy', name: 'Dummy App' });
  });

  it('returns null for an inactive token', () => {
    expect(
      resolveAppFromToken({ active: false, client_id: 'app_dummy' })
    ).toBeNull();
  });

  it('returns null without a client id', () => {
    expect(resolveAppFromToken({ active: true })).toBeNull();
  });
});

describe('resolveAppTokenScope', () => {
  const token = {
    active: true,
    client_id: 'app_dummy',
    team: { id: 'team_dummy', slug: 'dummy' },
  };

  it('applies the token team when the scope matches its slug', async () => {
    introspectTokenMock.mockResolvedValue(token);
    await expect(resolveAppTokenScope(client, 'dummy')).resolves.toBe(true);
    expect(client.config.currentTeam).toEqual('team_dummy');
  });

  it('applies the token team when the scope matches its id', async () => {
    introspectTokenMock.mockResolvedValue(token);
    await expect(resolveAppTokenScope(client, 'team_dummy')).resolves.toBe(
      true
    );
    expect(client.config.currentTeam).toEqual('team_dummy');
  });

  it('does not apply a scope that does not match the token team', async () => {
    introspectTokenMock.mockResolvedValue(token);
    await expect(resolveAppTokenScope(client, 'other')).resolves.toBe(false);
    expect(client.config.currentTeam).toBeUndefined();
  });

  it('returns false when the token has no team', async () => {
    introspectTokenMock.mockResolvedValue({
      active: true,
      client_id: 'app_dummy',
    });
    await expect(resolveAppTokenScope(client, 'dummy')).resolves.toBe(false);
  });

  it('returns false when introspection fails', async () => {
    introspectTokenMock.mockRejectedValue(new Error('introspection failed'));
    await expect(resolveAppTokenScope(client, 'dummy')).resolves.toBe(false);
  });
});
