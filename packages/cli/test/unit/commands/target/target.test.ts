import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import target from '../../../../src/commands/target';

describe('target', () => {
  // this requires mocking a linked project
  it.todo('errors when invoked without subcommand', () => {
    client.setArgv('target');
    const exitCodePromise = target(client);
    expect(exitCodePromise).resolves.toBe(2);
  });

  it('should reject invalid arguments', async () => {
    client.setArgv('--invalid');
    const result = await target(client);
    expect(result).toBe(1);
  });
});
