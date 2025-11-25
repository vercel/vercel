import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { determineAgent, KNOWN_AGENTS } from '../../src/index';
import mockFs from 'mock-fs';

vi.setConfig({ testTimeout: 6 * 60 * 1000 });

describe('determineAgent', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('AI_AGENT', '');
    vi.stubEnv('CURSOR_TRACE_ID', '');
    vi.stubEnv('CURSOR_AGENT', '');
    vi.stubEnv('GEMINI_CLI', '');
    vi.stubEnv('CODEX_SANDBOX', '');
    vi.stubEnv('CLAUDECODE', '');
    vi.stubEnv('CLAUDE_CODE', '');
    vi.stubEnv('REPL_ID', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    mockFs.restore();
  });

  describe('custom agent detection from `AI_AGENT`', () => {
    describe('AI_AGENT not set', () => {
      it('returns no agent', async () => {
        const result = await determineAgent();
        expect(result).toEqual({ isAgent: false });
      });
    });

    describe('AI_AGENT set', () => {
      beforeEach(() => {
        vi.stubEnv('AI_AGENT', 'custom-agent');
      });

      it('detects custom agent', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: 'custom-agent' },
        });
      });
    });
  });

  describe('cursor detection', () => {
    describe('CURSOR_TRACE_ID not set', () => {
      it('returns no agent', async () => {
        const result = await determineAgent();
        expect(result).toEqual({ isAgent: false });
      });
    });

    describe('CURSOR_TRACE_ID set', () => {
      beforeEach(() => {
        vi.stubEnv('CURSOR_TRACE_ID', 'some-uuid');
      });

      it('detects cursor', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: KNOWN_AGENTS.CURSOR },
        });
      });
    });
  });

  describe('cursor cli detection', () => {
    describe('CURSOR_AGENT not set', () => {
      it('returns no agent', async () => {
        const result = await determineAgent();
        expect(result).toEqual({ isAgent: false });
      });
    });

    describe('CURSOR_AGENT set', () => {
      beforeEach(() => {
        vi.stubEnv('CURSOR_AGENT', '1');
      });

      it('detects cursor cli', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: KNOWN_AGENTS.CURSOR_CLI },
        });
      });
    });
  });

  describe('gemini detection', () => {
    describe('GEMINI_CLI not set', () => {
      it('returns no agent', async () => {
        const result = await determineAgent();
        expect(result).toEqual({ isAgent: false });
      });
    });

    describe('GEMINI_CLI set', () => {
      beforeEach(() => {
        vi.stubEnv('GEMINI_CLI', '1');
      });

      it('detects gemini', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: KNOWN_AGENTS.GEMINI },
        });
      });
    });
  });

  describe('codex detection', () => {
    describe('CODEX_SANDBOX not set', () => {
      it('returns no agent', async () => {
        const result = await determineAgent();
        expect(result).toEqual({ isAgent: false });
      });
    });

    describe('CODEX_SANDBOX set', () => {
      beforeEach(() => {
        vi.stubEnv('CODEX_SANDBOX', 'seatbelt');
      });

      it('detects codex', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: KNOWN_AGENTS.CODEX },
        });
      });
    });
  });

  describe('claude detection', () => {
    describe('CLAUDE_CODE not set', () => {
      it('returns no agent', async () => {
        const result = await determineAgent();
        expect(result).toEqual({ isAgent: false });
      });
    });

    describe('CLAUDE_CODE set', () => {
      beforeEach(() => {
        vi.stubEnv('CLAUDE_CODE', '1');
      });

      it('detects claude', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: KNOWN_AGENTS.CLAUDE },
        });
      });
    });

    describe('CLAUDECODE set', () => {
      beforeEach(() => {
        vi.stubEnv('CLAUDECODE', '1');
      });

      it('detects claude', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: KNOWN_AGENTS.CLAUDE },
        });
      });
    });
  });

  describe('devin detection', () => {
    describe('/opt/.devin does not exist', () => {
      it('returns no agent', async () => {
        const result = await determineAgent();
        expect(result).toEqual({ isAgent: false });
      });
    });

    describe('/opt/.devin exists', () => {
      beforeEach(() => {
        mockFs({
          '/opt/.devin': mockFs.directory({
            mode: 0o755,
          }),
        });
      });

      it('detects devin', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: KNOWN_AGENTS.DEVIN },
        });
      });
    });
  });

  describe('replit detection', () => {
    describe('REPL_ID not set', () => {
      it('returns no agent', async () => {
        const result = await determineAgent();
        expect(result).toEqual({ isAgent: false });
      });
    });

    describe('REPL_ID set', () => {
      beforeEach(() => {
        vi.stubEnv('REPL_ID', '1');
      });

      it('detects replit', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: KNOWN_AGENTS.REPLIT },
        });
      });
    });
  });

  describe('priority order detection', () => {
    it('AI_AGENT takes highest priority over all other environment variables', async () => {
      vi.stubEnv('AI_AGENT', 'custom-priority');
      vi.stubEnv('CURSOR_TRACE_ID', 'some-uuid');
      vi.stubEnv('CURSOR_AGENT', '1');
      vi.stubEnv('GEMINI_CLI', '1');
      vi.stubEnv('CODEX_SANDBOX', 'seatbelt');
      vi.stubEnv('CLAUDE_CODE', '1');
      vi.stubEnv('REPL_ID', '1');
      mockFs({
        '/opt/.devin': mockFs.directory({
          mode: 0o755,
        }),
      });

      const result = await determineAgent();
      expect(result).toEqual({
        isAgent: true,
        agent: { name: 'custom-priority' },
      });
    });

    it('CURSOR_TRACE_ID takes priority over other agents (except AI_AGENT)', async () => {
      vi.stubEnv('CURSOR_TRACE_ID', 'some-uuid');
      vi.stubEnv('CURSOR_AGENT', '1');
      vi.stubEnv('GEMINI_CLI', '1');
      vi.stubEnv('CODEX_SANDBOX', 'seatbelt');
      vi.stubEnv('CLAUDE_CODE', '1');
      vi.stubEnv('REPL_ID', '1');
      mockFs({
        '/opt/.devin': mockFs.directory({
          mode: 0o755,
        }),
      });

      const result = await determineAgent();
      expect(result).toEqual({
        isAgent: true,
        agent: { name: KNOWN_AGENTS.CURSOR },
      });
    });

    it('CURSOR_AGENT takes priority over remaining agents', async () => {
      vi.stubEnv('CURSOR_AGENT', '1');
      vi.stubEnv('GEMINI_CLI', '1');
      vi.stubEnv('CODEX_SANDBOX', 'seatbelt');
      vi.stubEnv('CLAUDE_CODE', '1');
      vi.stubEnv('REPL_ID', '1');
      mockFs({
        '/opt/.devin': mockFs.directory({
          mode: 0o755,
        }),
      });

      const result = await determineAgent();
      expect(result).toEqual({
        isAgent: true,
        agent: { name: KNOWN_AGENTS.CURSOR_CLI },
      });
    });
  });

  describe('edge cases', () => {
    it('handles empty string values for environment variables', async () => {
      vi.stubEnv('AI_AGENT', '');
      vi.stubEnv('CURSOR_TRACE_ID', '');

      const result = await determineAgent();
      expect(result).toEqual({ isAgent: false });
    });

    it('handles whitespace-only values for AI_AGENT', async () => {
      vi.stubEnv('AI_AGENT', '   ');

      const result = await determineAgent();
      expect(result).toEqual({ isAgent: false });
    });

    it('handles special characters in AI_AGENT value', async () => {
      vi.stubEnv('AI_AGENT', 'my-custom-agent@v1.0');

      const result = await determineAgent();
      expect(result).toEqual({
        isAgent: true,
        agent: { name: 'my-custom-agent@v1.0' },
      });
    });

    it('trims leading and trailing whitespace from AI_AGENT', async () => {
      vi.stubEnv('AI_AGENT', '  custom-agent  ');

      const result = await determineAgent();
      expect(result).toEqual({
        isAgent: true,
        agent: { name: 'custom-agent' },
      });
    });

    it('handles file system errors gracefully for devin detection', async () => {
      mockFs({
        '/opt': mockFs.directory({
          mode: 0o000, // No read permission on parent directory
        }),
      });

      const result = await determineAgent();
      expect(result).toEqual({ isAgent: false });
    });
  });

  describe('convenience methods', () => {
    it('provides easy boolean check', async () => {
      vi.stubEnv('AI_AGENT', 'test-agent');

      const result = await determineAgent();
      expect(result.isAgent).toBe(true);
    });

    it('provides agent details when detected', async () => {
      vi.stubEnv('CURSOR_TRACE_ID', 'some-id');

      const result = await determineAgent();
      if (result.isAgent) {
        expect(result.agent?.name).toBe(KNOWN_AGENTS.CURSOR);
      }
    });

    it('has no agent details when not detected', async () => {
      const result = await determineAgent();
      expect(result.isAgent).toBe(false);
      expect(result.agent).toBeUndefined();
    });
  });
});
