import { client } from '../../mocks/client';
import rollback from '../../../src/commands/rollback';

describe('rollback', () => {
  it('should error if invalid action', async () => {
    await expect(rollback(client)).rejects.toThrow('Oh no!');
  });
});
