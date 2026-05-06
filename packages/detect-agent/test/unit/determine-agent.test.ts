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
    vi.stubEnv('CURSOR_EXTENSION_HOST_ROLE', '');
    vi.stubEnv('GEMINI_CLI', '');
    vi.stubEnv('CODEX_SANDBOX', '');
    vi.stubEnv('CODEX_CI', '');
    vi.stubEnv('CODEX_THREAD_ID', '');
    vi.stubEnv('ANTIGRAVITY_AGENT', '');
    vi.stubEnv('AUGMENT_AGENT', '');
    vi.stubEnv('OPENCODE_CLIENT', '');
    vi.stubEnv('CLAUDECODE', '');
    vi.stubEnv('CLAUDE_CODE', '');
    vi.stubEnv('CLAUDE_CODE_IS_COWORK', '');
    vi.stubEnv('REPL_ID', '');
    vi.stubEnv('COPILOT_MODEL', '');
    vi.stubEnv('COPILOT_ALLOW_ALL', '');
    vi.stubEnv('COPILOT_GITHUB_TOKEN', '');
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

  describe('v0 detection', () => {
    it('detects v0 from AI_AGENT=v0', async () => {
      vi.stubEnv('AI_AGENT', 'v0');

      const result = await determineAgent();
      expect(result).toEqual({
        isAgent: true,
        agent: { name: KNOWN_AGENTS.V0 },
      });
    });
  });

  describe('github copilot detection', () => {
    it('detects github copilot from AI_AGENT=github-copilot', async () => {
      vi.stubEnv('AI_AGENT', 'github-copilot');

      const result = await determineAgent();
      expect(result).toEqual({
        isAgent: true,
        agent: { name: KNOWN_AGENTS.GITHUB_COPILOT },
      });
    });

    it('detects github copilot from AI_AGENT=github-copilot-cli', async () => {
      vi.stubEnv('AI_AGENT', 'github-copilot-cli');

      const result = await determineAgent();
      expect(result).toEqual({
        isAgent: true,
        agent: { name: KNOWN_AGENTS.GITHUB_COPILOT },
      });
    });

    it('detects github copilot from COPILOT_MODEL', async () => {
      vi.stubEnv('COPILOT_MODEL', 'gpt-5');

      const result = await determineAgent();
      expect(result).toEqual({
        isAgent: true,
        agent: { name: KNOWN_AGENTS.GITHUB_COPILOT },
      });
    });

    it('detects github copilot from COPILOT_ALLOW_ALL', async () => {
      vi.stubEnv('COPILOT_ALLOW_ALL', 'true');

      const result = await determineAgent();
      expect(result).toEqual({
        isAgent: true,
        agent: { name: KNOWN_AGENTS.GITHUB_COPILOT },
      });
    });

    it('detects github copilot from COPILOT_GITHUB_TOKEN', async () => {
      vi.stubEnv('COPILOT_GITHUB_TOKEN', 'ghp_xxx');

      const result = await determineAgent();
      expect(result).toEqual({
        isAgent: true,
        agent: { name: KNOWN_AGENTS.GITHUB_COPILOT },
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

    describe('CURSOR_EXTENSION_HOST_ROLE=agent-exec', () => {
      it('detects cursor cli', async () => {
        vi.stubEnv('CURSOR_EXTENSION_HOST_ROLE', 'agent-exec');
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

    describe('CODEX_CI set', () => {
      beforeEach(() => {
        vi.stubEnv('CODEX_CI', '1');
      });

      it('detects codex', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: KNOWN_AGENTS.CODEX },
        });
      });
    });

    describe('CODEX_THREAD_ID set', () => {
      beforeEach(() => {
        vi.stubEnv('CODEX_THREAD_ID', 'thread-123');
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

  describe('antigravity detection', () => {
    describe('ANTIGRAVITY_AGENT not set', () => {
      it('returns no agent', async () => {
        const result = await determineAgent();
        expect(result).toEqual({ isAgent: false });
      });
    });

    describe('ANTIGRAVITY_AGENT set', () => {
      beforeEach(() => {
        vi.stubEnv('ANTIGRAVITY_AGENT', '1');
      });

      it('detects antigravity', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: KNOWN_AGENTS.ANTIGRAVITY },
        });
      });
    });
  });

  describe('antigravity detection', () => {
    describe('ANTIGRAVITY_AGENT not set', () => {
      it('returns no agent', async () => {
        const result = await determineAgent();
        expect(result).toEqual({ isAgent: false });
      });
    });

    describe('ANTIGRAVITY_AGENT set', () => {
      beforeEach(() => {
        vi.stubEnv('ANTIGRAVITY_AGENT', '1');
      });

      it('detects antigravity', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: KNOWN_AGENTS.ANTIGRAVITY },
        });
      });
    });
  });

  describe('augment cli detection', () => {
    describe('AUGMENT_AGENT not set', () => {
      it('returns no agent', async () => {
        const result = await determineAgent();
        expect(result).toEqual({ isAgent: false });
      });
    });

    describe('AUGMENT_AGENT set', () => {
      beforeEach(() => {
        vi.stubEnv('AUGMENT_AGENT', '1');
      });

      it('detects augment cli', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: KNOWN_AGENTS.AUGMENT_CLI },
        });
      });
    });
  });

  describe('opencode detection', () => {
    describe('OPENCODE_CLIENT not set', () => {
      it('returns no agent', async () => {
        const result = await determineAgent();
        expect(result).toEqual({ isAgent: false });
      });
    });

    describe('OPENCODE_CLIENT set', () => {
      beforeEach(() => {
        vi.stubEnv('OPENCODE_CLIENT', 'opencode');
      });

      it('detects opencode', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: KNOWN_AGENTS.OPENCODE },
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

  describe('cowork detection', () => {
    describe('CLAUDE_CODE_IS_COWORK not set', () => {
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

    describe('CLAUDE_CODE_IS_COWORK set with CLAUDECODE', () => {
      beforeEach(() => {
        vi.stubEnv('CLAUDECODE', '1');
        vi.stubEnv('CLAUDE_CODE_IS_COWORK', '1');
      });

      it('detects cowork', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: KNOWN_AGENTS.COWORK },
        });
      });
    });

    describe('CLAUDE_CODE_IS_COWORK set with CLAUDE_CODE', () => {
      beforeEach(() => {
        vi.stubEnv('CLAUDE_CODE', '1');
        vi.stubEnv('CLAUDE_CODE_IS_COWORK', '1');
      });

      it('detects cowork', async () => {
        const result = await determineAgent();
        expect(result).toEqual({
          isAgent: true,
          agent: { name: KNOWN_AGENTS.COWORK },
        });
      });
    });

    describe('CLAUDE_CODE_IS_COWORK set without CLAUDECODE or CLAUDE_CODE', () => {
      beforeEach(() => {
        vi.stubEnv('CLAUDE_CODE_IS_COWORK', '1');
      });

      it('returns no agent', async () => {
        const result = await determineAgent();
        expect(result).toEqual({ isAgent: false });
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
      vi.stubEnv('ANTIGRAVITY_AGENT', '1');
      vi.stubEnv('AUGMENT_AGENT', '1');
      vi.stubEnv('OPENCODE_CLIENT', 'opencode');
      vi.stubEnv('CLAUDE_CODE', '1');
      vi.stubEnv('REPL_ID', '1');
      vi.stubEnv('COPILOT_MODEL', 'gpt-5');
      vi.stubEnv('COPILOT_ALLOW_ALL', 'true');
      vi.stubEnv('COPILOT_GITHUB_TOKEN', 'ghp_xxx');
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
      vi.stubEnv('ANTIGRAVITY_AGENT', '1');
      vi.stubEnv('AUGMENT_AGENT', '1');
      vi.stubEnv('OPENCODE_CLIENT', 'opencode');
      vi.stubEnv('CLAUDE_CODE', '1');
      vi.stubEnv('REPL_ID', '1');
      vi.stubEnv('COPILOT_MODEL', 'gpt-5');
      vi.stubEnv('COPILOT_ALLOW_ALL', 'true');
      vi.stubEnv('COPILOT_GITHUB_TOKEN', 'ghp_xxx');
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
      vi.stubEnv('ANTIGRAVITY_AGENT', '1');
      vi.stubEnv('AUGMENT_AGENT', '1');
      vi.stubEnv('OPENCODE_CLIENT', 'opencode');
      vi.stubEnv('CLAUDE_CODE', '1');
      vi.stubEnv('REPL_ID', '1');
      vi.stubEnv('COPILOT_MODEL', 'gpt-5');
      vi.stubEnv('COPILOT_ALLOW_ALL', 'true');
      vi.stubEnv('COPILOT_GITHUB_TOKEN', 'ghp_xxx');
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
