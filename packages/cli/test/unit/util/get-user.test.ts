import { beforeEach, describe, expect, it, vi } from 'vitest';
import getUser from '../../../src/util/get-user';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import writeJSON from 'write-json-file';

vi.mock('write-json-file', () => ({
  default: {
    sync: vi.fn(),
  },
}));

const writeJsonSync = vi.mocked(writeJSON.sync);

describe('getUser', () => {
  beforeEach(() => {
    client.telemetryEventStore.reset();
    writeJsonSync.mockReset();
  });

  it('caches the userId after fetching the user', async () => {
    const user = useUser();
    client.authConfig.skipWrite = false;

    const result = await getUser(client);

    expect(result.id).toBe(user.id);
    expect(client.authConfig.userId).toBe(user.id);
    expect(client.telemetryEventStore.hasUserId).toBe(true);
    expect(writeJsonSync).toHaveBeenCalledTimes(1);
  });

  it('does not rewrite auth config when the cached userId is already current', async () => {
    const user = useUser();
    client.authConfig.userId = user.id;

    const result = await getUser(client);

    expect(result.id).toBe(user.id);
    expect(client.authConfig.userId).toBe(user.id);
    expect(client.telemetryEventStore.hasUserId).toBe(true);
    expect(writeJsonSync).not.toHaveBeenCalled();
  });

  it('clears cached userId in best-effort mode when the token is invalid', async () => {
    client.authConfig.userId = 'user_stale';
    client.authConfig.skipWrite = false;

    client.scenario.get('/v2/user', (_req, res) => {
      res.status(403).json({ error: { message: 'forbidden' } });
    });

    await expect(getUser(client)).rejects.toMatchObject({
      code: 'NOT_AUTHORIZED',
    });

    expect(client.authConfig.userId).toBeUndefined();
    expect(writeJsonSync).toHaveBeenCalledTimes(1);
  });
});
