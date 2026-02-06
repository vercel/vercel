import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../mocks/client';

describe('Client confirmation prompts', () => {
  beforeEach(() => {
    // Reset client state
    client.reset();
  });

  describe('DELETE operations', () => {
    it('should prompt for confirmation on DELETE', async () => {
      // Disable skip to test confirmation prompt
      client.dangerouslySkipPermissions = false;
      // Mock confirm to return true
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmMutatingOperation(
        '/v9/test',
        'DELETE'
      );

      expect(client.input.confirm).toHaveBeenCalledTimes(1);
      expect(client.input.confirm).toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        false
      );
      expect(result).toBe(true);
    });

    it('should cancel DELETE when user says no', async () => {
      // Disable skip to test confirmation prompt
      client.dangerouslySkipPermissions = false;
      // Mock confirm to return false
      client.input.confirm = vi.fn().mockResolvedValue(false);

      const result = await client.confirmMutatingOperation(
        '/v9/test',
        'DELETE'
      );

      expect(client.input.confirm).toHaveBeenCalledTimes(1);
      expect(result).toBe(false);
    });

    it('should skip confirmation with --dangerously-skip-permissions flag', async () => {
      client.dangerouslySkipPermissions = true;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmMutatingOperation(
        '/v9/test',
        'DELETE'
      );

      // Confirm should NOT be called when dangerouslySkipPermissions is true
      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should show error in non-TTY mode without --dangerously-skip-permissions', async () => {
      // Disable skip to test non-TTY error behavior
      client.dangerouslySkipPermissions = false;
      client.stdin.isTTY = false;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmMutatingOperation(
        '/v9/test',
        'DELETE'
      );

      // Confirm should NOT be called in non-TTY mode
      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(false);

      // Should show error message
      const output = client.stderr.getFullOutput();
      expect(output).toContain('DELETE operations require confirmation');
      expect(output).toContain('--dangerously-skip-permissions');
    });

    it('should work in non-TTY mode with --dangerously-skip-permissions flag', async () => {
      client.stdin.isTTY = false;
      client.dangerouslySkipPermissions = true;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmMutatingOperation(
        '/v9/test',
        'DELETE'
      );

      expect(result).toBe(true);
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

      const result = await client.confirmMutatingOperation(
        '/v9/test',
        'DELETE'
      );

      expect(result).toBe(true);

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

      const result = await client.confirmMutatingOperation(
        '/v9/test',
        'DELETE'
      );

      expect(result).toBe(true);

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

      const result = await client.confirmMutatingOperation('/v9/test', 'GET');

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should not prompt for POST requests', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmMutatingOperation('/v9/test', 'POST');

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should not prompt for PUT requests', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmMutatingOperation('/v9/test', 'PUT');

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should not prompt for PATCH requests', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmMutatingOperation('/v9/test', 'PATCH');

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should not prompt for requests with no method specified (defaults to GET)', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmMutatingOperation(
        '/v9/test',
        undefined
      );

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle lowercase delete method', async () => {
      client.dangerouslySkipPermissions = true;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmMutatingOperation(
        '/v9/test',
        'delete'
      );

      expect(result).toBe(true);
    });

    it('should handle mixed case DELETE method', async () => {
      client.dangerouslySkipPermissions = true;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmMutatingOperation(
        '/v9/test',
        'Delete'
      );

      expect(result).toBe(true);
    });

    it('should include URL in confirmation message', async () => {
      // Disable skip to test confirmation message content
      client.dangerouslySkipPermissions = false;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      await client.confirmMutatingOperation('/v9/test', 'DELETE');

      expect(client.input.confirm).toHaveBeenCalledWith(
        expect.stringContaining('/v9/test'),
        false
      );
    });
  });
});
