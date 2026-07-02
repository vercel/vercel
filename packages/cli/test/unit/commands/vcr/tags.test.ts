import { describe, it, expect } from 'vitest';
import vcr from '../../../../src/commands/vcr';
import { client } from '../../../mocks/client';

describe('vcr tags', () => {
  it('displays help when invoked without subcommand', async () => {
    client.setArgv('vcr', 'tags');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Please specify a valid subcommand'
    );
  });

  it('errors on an unknown subcommand', async () => {
    client.setArgv('vcr', 'tags', 'bogus');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Unknown "vcr tags"');
  });
});
