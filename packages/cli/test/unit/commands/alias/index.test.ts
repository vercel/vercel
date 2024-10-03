import { describe, it, expect, afterEach, vi } from 'vitest';
import alias from '../../../../src/commands/alias';
import * as set from '../../../../src/commands/alias/set';
import { client } from '../../../mocks/client';

describe('alias', () => {
  const setSpy = vi.spyOn(set, 'default').mockResolvedValue(0);

  afterEach(() => {
    setSpy.mockClear();
  });

  it('routes to set subcommand', async () => {
    const args = ['dpl_123', 'example.com'];
    const opts = {};

    client.setArgv('alias', ...args);
    await alias(client);
    expect(setSpy).toHaveBeenCalledWith(client, opts, args);
  });
});
