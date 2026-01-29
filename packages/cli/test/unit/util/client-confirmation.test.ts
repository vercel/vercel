import { describe, expect, it, beforeEach, vi } from 'vitest';
import { client } from '../../mocks/client';

describe('Client confirmMutatingOperation', () => {
  beforeEach(() => {
    // Reset client state
    client.reset();
  });

  describe('DELETE operations', () => {
    it('should prompt for confirmation on DELETE', async () => {
      client.dangerouslySkipPermissions = false;
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

    it('should return false when user cancels DELETE', async () => {
      client.dangerouslySkipPermissions = false;
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

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false in non-TTY mode without --dangerously-skip-permissions', async () => {
      client.dangerouslySkipPermissions = false;
      client.stdin.isTTY = false;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmMutatingOperation(
        '/v9/test',
        'DELETE'
      );

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(false);

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
      expect(output).not.toContain('(undefined)');
    });
  });

  describe('Non-DELETE operations', () => {
    it('should return true for GET requests without prompting', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmMutatingOperation('/v9/test', 'GET');

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return true for POST requests without prompting', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmMutatingOperation('/v9/test', 'POST');

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return true for PUT requests without prompting', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmMutatingOperation('/v9/test', 'PUT');

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return true for PATCH requests without prompting', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmMutatingOperation('/v9/test', 'PATCH');

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return true for undefined method (defaults to GET)', async () => {
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
