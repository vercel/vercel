import { beforeEach, describe, expect, it } from 'vitest';
import getUser, { getCachedUsername } from '../../../src/util/get-user';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';

describe('getUser', () => {
  beforeEach(() => {
    client.telemetryEventStore.reset();
  });

  it('caches the userId and username after fetching the user', async () => {
    const user = useUser();

    const result = await getUser(client);

    expect(result.id).toBe(user.id);
    expect(client.authConfig.userId).toBe(user.id);
    expect(client.authConfig.cachedUser).toEqual({
      id: user.id,
      username: user.username,
    });
    expect(client.telemetryEventStore.hasUserId).toBe(true);
  });

  it('does not rewrite auth config when the cached userId is already current', async () => {
    const user = useUser();
    client.authConfig.userId = user.id;

    const result = await getUser(client);

    expect(result.id).toBe(user.id);
    expect(client.authConfig.userId).toBe(user.id);
    expect(client.telemetryEventStore.hasUserId).toBe(true);
  });

  it('reuses the fetched user within the same client invocation', async () => {
    const user = {
      id: 'user_cached',
      email: 'cached@example.com',
      name: 'Cached User',
      username: 'cached-user',
    };
    let fetchCount = 0;
    client.scenario.get('/v2/user', (_req, res) => {
      fetchCount++;
      res.json({ user });
    });

    const first = await getUser(client);
    const second = await getUser(client);

    expect(first.id).toBe(user.id);
    expect(second.id).toBe(user.id);
    expect(fetchCount).toBe(1);
  });

  it('clears cached userId and username in best-effort mode when the token is invalid', async () => {
    client.authConfig.userId = 'user_stale';
    client.authConfig.cachedUser = { id: 'user_stale', username: 'stale-name' };

    client.scenario.get('/v2/user', (_req, res) => {
      res.status(403).json({ error: { message: 'forbidden' } });
    });

    await expect(getUser(client)).rejects.toMatchObject({
      code: 'NOT_AUTHORIZED',
    });

    expect(client.authConfig.userId).toBeUndefined();
    expect(client.authConfig.cachedUser).toBeUndefined();
  });

  describe('getCachedUsername', () => {
    const cachedUser = { id: 'user_saved', username: 'saved-name' };
    const past = Math.floor(Date.now() / 1000) - 60;

    it('returns the name saved for the current user', () => {
      expect(
        getCachedUsername({ token: 't', userId: 'user_saved', cachedUser })
      ).toBe('saved-name');
    });

    it('ignores a name saved for another user', () => {
      expect(
        getCachedUsername({ token: 't', userId: 'user_other', cachedUser })
      ).toBeUndefined();
      expect(getCachedUsername({ token: 't', cachedUser })).toBeUndefined();
    });

    it('ignores the name when the token expired and cannot be refreshed', () => {
      expect(
        getCachedUsername({
          token: 't',
          expiresAt: past,
          userId: 'user_saved',
          cachedUser,
        })
      ).toBeUndefined();
    });

    it('keeps the name when an expired token can be refreshed', () => {
      expect(
        getCachedUsername({
          token: 't',
          expiresAt: past,
          refreshToken: 'r',
          userId: 'user_saved',
          cachedUser,
        })
      ).toBe('saved-name');
    });
  });
});
