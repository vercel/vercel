import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import analytics from '../../../../src/commands/analytics';

describe('analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
  });

  describe('--help', () => {
    it('should print help and return 0', async () => {
      client.setArgv('analytics', '--help');

      const exitCode = await analytics(client);

      expect(exitCode).toBe(0);
      const output = client.stderr.getFullOutput();
      expect(output).toContain('analytics');
      expect(output).toContain('status');
      expect(output).toContain('enable');
      expect(output).toContain('disable');
      expect(output).toContain('alerts');
    });
  });

  describe('subcommand routing', () => {
    it('should show status subcommand help', async () => {
      client.setArgv('analytics', 'status', '--help');

      const exitCode = await analytics(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).toContain('status');
    });

    it('should show alerts subcommand help', async () => {
      client.setArgv('analytics', 'alerts', '--help');

      const exitCode = await analytics(client);

      expect(exitCode).toBe(0);
      expect(client.stderr.getFullOutput()).toContain('alerts');
    });
  });
});
