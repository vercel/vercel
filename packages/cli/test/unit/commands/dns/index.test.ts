import { describe, it, expect, afterEach, vi } from 'vitest';
import dns from '../../../../src/commands/dns';
import * as ls from '../../../../src/commands/dns/ls';
import { client } from '../../../mocks/client';

describe('dns', () => {
  const lsSpy = vi.spyOn(ls, 'default').mockResolvedValue(0);

  afterEach(() => {
    lsSpy.mockClear();
  });

  it('routes to ls subcommand', async () => {
    const args = ['example.com'];
    const opts = {};

    client.setArgv('dns', ...args);
    await dns(client);
    expect(lsSpy).toHaveBeenCalledWith(client, opts, args);
  });
});
