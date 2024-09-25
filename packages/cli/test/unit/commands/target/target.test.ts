import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import target from '../../../../src/commands/target';

describe('target', () => {
  it.todo('errors when invoked without subcommand');

  it('should reject invalid arguments', async () => {
    client.setArgv('--invalid');
    const result = await target(client);
    expect(result).toBe(1);
  });
});
