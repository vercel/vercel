import { beforeEach, describe, expect, it } from 'vitest';
import getUser from '../../../src/util/get-user';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';

describe('getUser', () => {
  beforeEach(() => {
    client.telemetryEventStore.reset();
  });

  it('caches the userId after fetching the user', async () => {
    const user = useUser();

    const result = await getUser(client);

    expect(result.id).toBe(user.id);
    expect(client.authConfig.userId).toBe(user.id);
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

  it('clears cached userId in best-effort mode when the token is invalid', async () => {
    client.authConfig.userId = 'user_stale';

    client.scenario.get('/v2/user', (_req, res) => {
      res.status(403).json({ error: { message: 'forbidden' } });
    });

    await expect(getUser(client)).rejects.toMatchObject({
      code: 'NOT_AUTHORIZED',
    });

    expect(client.authConfig.userId).toBeUndefined();
  });
});
