import { beforeEach, describe, expect, it, vi } from 'vitest';
import install from '../../../src/commands/install';
import * as add from '../../../src/commands/integration/add';
import { client } from '../../mocks/client';

const addSpy = vi.spyOn(add, 'add').mockResolvedValue(0);

beforeEach(() => {
  addSpy.mockClear();
});

describe('install', () => {
  it('is an alias for "integration add"', async () => {
    client.setArgv('install', 'acme');
    await install(client);
    expect(addSpy).toHaveBeenCalledWith(client, ['acme']);
  });
});
