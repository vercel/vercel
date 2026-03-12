import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { client } from '../../mocks/client';

describe('Client confirmation prompts', () => {
  beforeEach(() => {
    // Reset client state
    client.reset();
  });

  describe('confirmMutatingOperation (DELETE only)', () => {
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

    it('should cancel DELETE when user says no', async () => {
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

    it('should show error in non-TTY mode without --dangerously-skip-permissions', async () => {
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

    it('should show agent warning when agent bypasses DELETE confirmation', async () => {
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

  describe('confirmAgentMutatingOperation', () => {
    it('should allow GET requests without confirmation', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmAgentMutatingOperation(
        '/v9/test',
        'GET'
      );

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should allow requests with no method (defaults to GET)', async () => {
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmAgentMutatingOperation(
        '/v9/test',
        undefined
      );

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should skip confirmation with --dangerously-skip-permissions and show warning', async () => {
      client.agentName = 'test-agent';
      client.dangerouslySkipPermissions = true;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmAgentMutatingOperation(
        '/v9/test',
        'POST'
      );

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);

      const output = client.stderr.getFullOutput();
      expect(output).toContain('WARNING');
      expect(output).toContain('AGENT MODE');
      expect(output).toContain('POST');
      expect(output).toContain('test-agent');
    });

    it('should bypass confirmation with --with-agent-confirmation flag', async () => {
      client.withAgentConfirmation = true;
      client.dangerouslySkipPermissions = false;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmAgentMutatingOperation(
        '/v9/test',
        'POST'
      );

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should bypass confirmation with --with-agent-confirmation for DELETE', async () => {
      client.withAgentConfirmation = true;
      client.dangerouslySkipPermissions = false;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmAgentMutatingOperation(
        '/v9/test',
        'DELETE'
      );

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should still allow GET without --with-agent-confirmation', async () => {
      client.withAgentConfirmation = false;
      client.input.confirm = vi.fn().mockResolvedValue(true);

      const result = await client.confirmAgentMutatingOperation(
        '/v9/test',
        'GET'
      );

      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    describe('TTY mode (interactive prompt)', () => {
      it('should use interactive confirm for POST requests', async () => {
        client.dangerouslySkipPermissions = false;
        client.input.confirm = vi.fn().mockResolvedValue(true);

        const result = await client.confirmAgentMutatingOperation(
          '/v9/test',
          'POST'
        );

        expect(client.input.confirm).toHaveBeenCalledTimes(1);
        expect(client.input.confirm).toHaveBeenCalledWith(
          expect.stringContaining('POST'),
          false
        );
        expect(result).toBe(true);
      });

      it('should cancel when user says no', async () => {
        client.dangerouslySkipPermissions = false;
        client.input.confirm = vi.fn().mockResolvedValue(false);

        const result = await client.confirmAgentMutatingOperation(
          '/v9/test',
          'POST'
        );

        expect(client.input.confirm).toHaveBeenCalledTimes(1);
        expect(result).toBe(false);
      });
    });

    describe('non-TTY mode (structured JSON output)', () => {
      let mockExit: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        mockExit = vi
          .spyOn(process, 'exit')
          .mockImplementation(() => undefined as never);
      });

      afterEach(() => {
        mockExit.mockRestore();
      });

      it('should output command-level confirmation JSON and exit with code 0', async () => {
        client.dangerouslySkipPermissions = false;
        client.stdin.isTTY = false;
        client.commandName = 'project add';
        client.input.confirm = vi.fn().mockResolvedValue(true);

        await client.confirmAgentMutatingOperation('/v9/projects', 'POST');

        // Should NOT have used interactive confirm
        expect(client.input.confirm).not.toHaveBeenCalled();
        // Should exit cleanly with code 0
        expect(mockExit).toHaveBeenCalledWith(0);

        // Should have output structured JSON to stdout
        const stdoutOutput = client.stdout.getFullOutput();
        const confirmation = JSON.parse(stdoutOutput.trim());
        expect(confirmation.type).toBe('agent_confirmation_required');
        expect(confirmation.command).toBe('project add');
        expect(confirmation.message).toContain('vercel project add');
        expect(confirmation.message).toContain('write permissions');
        expect(confirmation.resolution).toContain('--with-agent-confirmation');
      });

      it('should fall back to method/url when commandName is not set', async () => {
        client.dangerouslySkipPermissions = false;
        client.stdin.isTTY = false;
        client.commandName = undefined;

        await client.confirmAgentMutatingOperation(
          '/v9/projects/my-proj',
          'DELETE'
        );

        expect(mockExit).toHaveBeenCalledWith(0);

        const stdoutOutput = client.stdout.getFullOutput();
        const confirmation = JSON.parse(stdoutOutput.trim());
        expect(confirmation.command).toBe('DELETE /v9/projects/my-proj');
      });

      it('should include teamId and resolved team slug when team is scoped', async () => {
        client.dangerouslySkipPermissions = false;
        client.stdin.isTTY = false;
        client.commandName = 'env add';
        client.config.currentTeam = 'team_abc123';
        client.scenario.get('/teams/team_abc123', (_req, res) => {
          res.json({ id: 'team_abc123', slug: 'my-team', name: 'My Team' });
        });

        await client.confirmAgentMutatingOperation('/v9/test', 'POST');

        expect(mockExit).toHaveBeenCalledWith(0);

        const stdoutOutput = client.stdout.getFullOutput();
        const confirmation = JSON.parse(stdoutOutput.trim());
        expect(confirmation.teamId).toBe('team_abc123');
        expect(confirmation.teamSlug).toBe('my-team');
        expect(confirmation.message).toContain('my-team');
      });

      it('should fall back to teamId when team name resolution fails', async () => {
        client.dangerouslySkipPermissions = false;
        client.stdin.isTTY = false;
        client.commandName = 'env add';
        client.config.currentTeam = 'team_abc123';
        client.scenario.get('/teams/team_abc123', (_req, res) => {
          res.status(404).json({ error: 'not found' });
        });

        await client.confirmAgentMutatingOperation('/v9/test', 'POST');

        expect(mockExit).toHaveBeenCalledWith(0);

        const stdoutOutput = client.stdout.getFullOutput();
        const confirmation = JSON.parse(stdoutOutput.trim());
        expect(confirmation.teamId).toBe('team_abc123');
        expect(confirmation.teamSlug).toBeUndefined();
        expect(confirmation.message).toContain('team_abc123');
      });
    });
  });
});
