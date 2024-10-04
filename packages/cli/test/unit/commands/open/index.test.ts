import { beforeEach, describe, expect, it, vi } from 'vitest';
import install from '../../../../src/commands/install';
import * as open from '../../../../src/commands/integration/open-integration';
import { client } from '../../../mocks/client';

const openSpy = vi.spyOn(open, 'openIntegration').mockResolvedValue(0);

beforeEach(() => {
  openSpy.mockClear();
});

describe('open', () => {
  describe('[integration]', () => {
    it('is an alias for "integration open"', async () => {
      client.setArgv('open', 'acme');
      await install(client);
      expect(openSpy).toHaveBeenCalledWith(client, ['acme']);
    });
  });
});
