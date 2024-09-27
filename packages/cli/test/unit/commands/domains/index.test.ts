import { describe, it, expect, afterEach, vi } from 'vitest';
import domains from '../../../../src/commands/domains';
import * as ls from '../../../../src/commands/domains/ls';
import { client } from '../../../mocks/client';

describe('domains', () => {
  const lsSpy = vi.spyOn(ls, 'default').mockResolvedValue(0);

  afterEach(() => {
    lsSpy.mockClear();
  });

  it('routes to ls subcommand', async () => {
    const args: string[] = [];
    const opts = {};

    client.setArgv('dns', ...args);
    await domains(client);
    expect(lsSpy).toHaveBeenCalledWith(client, opts, args);
  });
});
