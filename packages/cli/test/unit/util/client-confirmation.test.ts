import { describe, expect, it, beforeEach, vi } from 'vitest';
import { client } from '../../mocks/client';

describe('Client confirmation prompts', () => {
  beforeEach(() => {
    // Reset client state
    client.reset();

    // Mock a simple endpoint for testing
    client.scenario.get('/v9/test', (_req, res) => {
      res.json({ success: true });
    });
    client.scenario.post('/v9/test', (_req, res) => {
      res.json({ created: true });
    });
    client.scenario.put('/v9/test', (_req, res) => {
      res.json({ updated: true });
    });
    client.scenario.patch('/v9/test', (_req, res) => {
      res.json({ patched: true });
    });
    client.scenario.delete('/v9/test', (_req, res) => {
      res.json({ deleted: true });
    });
  });

  describe('DELETE operations', () => {
    it('should prompt for confirmation on DELETE', async () => {
      // Mock confirm to return true
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.fetch('/v9/test', { method: 'DELETE' });

      expect(client.input.confirm).toHaveBeenCalledTimes(1);
      expect(client.input.confirm).toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        false
      );
      expect(result).toEqual({ deleted: true });
    });

    it('should cancel DELETE when user says no', async () => {
      // Mock confirm to return false
      client.input.confirm = vi.fn().mockResolvedValue(false);

      await expect(
        client.fetch('/v9/test', { method: 'DELETE' })
      ).rejects.toThrow('Operation canceled by user');

      expect(client.input.confirm).toHaveBeenCalledTimes(1);
    });

    it('should skip confirmation with --dangerously-skip-permissions flag', async () => {
      client.dangerouslySkipPermissions = true;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.fetch('/v9/test', { method: 'DELETE' });

      // Confirm should NOT be called when dangerouslySkipPermissions is true
      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted: true });
    });

    it('should show error in non-TTY mode without --dangerously-skip-permissions', async () => {
      client.stdin.isTTY = false;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      await expect(
        client.fetch('/v9/test', { method: 'DELETE' })
      ).rejects.toThrow('Operation canceled by user');

      // Confirm should NOT be called in non-TTY mode
      expect(client.input.confirm).not.toHaveBeenCalled();

      // Should show error message
      const output = client.stderr.getFullOutput();
      expect(output).toContain('DELETE operations require confirmation');
      expect(output).toContain('--dangerously-skip-permissions');
    });

    it('should work in non-TTY mode with --dangerously-skip-permissions flag', async () => {
      client.stdin.isTTY = false;
      client.dangerouslySkipPermissions = true;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.fetch('/v9/test', { method: 'DELETE' });

      expect(result).toEqual({ deleted: true });
      // Confirm should NOT be called when dangerouslySkipPermissions is true
      expect(client.input.confirm).not.toHaveBeenCalled();
    });
  });

  describe('Agent mode', () => {
    it('should show warning when agent bypasses DELETE confirmation', async () => {
      client.isAgent = true;
      client.agentName = 'test-agent';
      client.dangerouslySkipPermissions = true;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.fetch('/v9/test', { method: 'DELETE' });

      expect(result).toEqual({ deleted: true });

      const output = client.stderr.getFullOutput();
      expect(output).toContain('WARNING');
      expect(output).toContain('AGENT MODE');
      expect(output).toContain('DELETE');
      expect(output).toContain('test-agent');
      expect(output).toContain('--dangerously-skip-permissions');
    });

    it('should show warning without agent name when not provided', async () => {
      client.isAgent = true;
      client.agentName = undefined;
      client.dangerouslySkipPermissions = true;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.fetch('/v9/test', { method: 'DELETE' });

      expect(result).toEqual({ deleted: true });

      const output = client.stderr.getFullOutput();
      expect(output).toContain('WARNING');
      expect(output).toContain('AGENT MODE');
      // Should NOT contain the agent name info when not provided
      expect(output).not.toContain('(undefined)');
    });
  });

  describe('Non-DELETE operations', () => {
    it('should not prompt for GET requests', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.fetch('/v9/test', { method: 'GET' });

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should not prompt for POST requests', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.fetch('/v9/test', { method: 'POST' });

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toEqual({ created: true });
    });

    it('should not prompt for PUT requests', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.fetch('/v9/test', { method: 'PUT' });

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toEqual({ updated: true });
    });

    it('should not prompt for PATCH requests', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.fetch('/v9/test', { method: 'PATCH' });

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toEqual({ patched: true });
    });

    it('should not prompt for requests with no method specified (defaults to GET)', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.fetch('/v9/test');

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  describe('Edge cases', () => {
    it('should handle lowercase delete method', async () => {
      client.dangerouslySkipPermissions = true;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.fetch('/v9/test', { method: 'delete' });

      expect(result).toEqual({ deleted: true });
    });

    it('should handle mixed case DELETE method', async () => {
      client.dangerouslySkipPermissions = true;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.fetch('/v9/test', { method: 'Delete' });

      expect(result).toEqual({ deleted: true });
    });

    it('should include URL in confirmation message', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      await client.fetch('/v9/test', { method: 'DELETE' });

      expect(client.input.confirm).toHaveBeenCalledWith(
        expect.stringContaining('/v9/test'),
        false
      );
    });
  });
});
