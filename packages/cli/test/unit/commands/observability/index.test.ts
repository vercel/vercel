import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import observability from '../../../../src/commands/observability';

describe('observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
  });

  describe('--help', () => {
    it('should print help and return 0', async () => {
      client.setArgv('observability', '--help');

      const exitCode = await observability(client);

      expect(exitCode).toBe(0);
      const output = client.stderr.getFullOutput();
      expect(output).toContain('observability');
      expect(output).toContain('config');
      expect(output).toContain('notebooks');
      expect(output).toContain('funnels');
      expect(output).toContain('query');
    });
  });

  describe('subcommand routing', () => {
    it('should show config subcommand help', async () => {
      client.setArgv('observability', 'config', '--help');

      const exitCode = await observability(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).toContain('config');
    });

    it('should show query subcommand help', async () => {
      client.setArgv('observability', 'query', '--help');

      const exitCode = await observability(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).toContain('query');
    });
  });
});
