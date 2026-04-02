import { beforeEach, describe, expect, it, vi } from 'vitest';
import getUser from '../../../src/util/get-user';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';

describe('getUser', () => {
  beforeEach(() => {
    client.telemetryEventStore.reset();
  });

  it('caches the userId after fetching the user', async () => {
    const user = useUser();
    const writeSpy = vi
      .spyOn(client, 'writeToAuthConfigFile')
      .mockImplementation(() => undefined);

    const result = await getUser(client);

    expect(result.id).toBe(user.id);
    expect(client.authConfig.userId).toBe(user.id);
    expect(client.telemetryEventStore.hasUserId).toBe(true);
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('does not rewrite auth config when the cached userId is already current', async () => {
    const user = useUser();
    client.authConfig.userId = user.id;
    const writeSpy = vi
      .spyOn(client, 'writeToAuthConfigFile')
      .mockImplementation(() => undefined);

    const result = await getUser(client);

    expect(result.id).toBe(user.id);
    expect(client.authConfig.userId).toBe(user.id);
    expect(client.telemetryEventStore.hasUserId).toBe(true);
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
