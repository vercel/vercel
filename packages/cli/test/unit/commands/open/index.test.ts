import { beforeEach, describe, expect, it, vi } from 'vitest';
import open from '../../../../src/commands/open';
import * as openIntegration from '../../../../src/commands/integration/open-integration';
import { client } from '../../../mocks/client';

const openSpy = vi
  .spyOn(openIntegration, 'openIntegration')
  .mockResolvedValue(0);

beforeEach(() => {
  openSpy.mockClear();
});

describe('open', () => {
  describe('[integration]', () => {
    it('is an alias for "integration open"', async () => {
      client.setArgv('open', 'acme');
      await open(client);
      expect(openSpy).toHaveBeenCalledWith(client, ['acme']);
    });
  });
});
