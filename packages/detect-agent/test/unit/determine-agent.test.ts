import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { determineAgent } from '../../src/index';
import mockFs from 'mock-fs';

vi.setConfig({ testTimeout: 6 * 60 * 1000 });

describe('checkTelemetryStatus', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mockFs.restore();
  });

  describe('custom agent detection from `AI_AGENT`', () => {
    describe('AI_AGENT not set', () => {
      it('is false', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq(false);
      });
    });

    describe('AI_AGENT set', () => {
      beforeEach(() => {
        vi.stubEnv('AI_AGENT', 'custom-agent');
      });

      it('detects', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq('custom-agent');
      });
    });
  });

  describe('cursor detection', () => {
    describe('CURSOR_TRACE_ID not set', () => {
      it('is false', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq(false);
      });
    });

    describe('CURSOR_TRACE_ID set', () => {
      beforeEach(() => {
        vi.stubEnv('CURSOR_TRACE_ID', 'some-uuid');
      });

      it('detects', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq('cursor');
      });
    });
  });

  describe('cursor cli detection', () => {
    describe('CURSOR_AGENT not set', () => {
      it('is false', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq(false);
      });
    });

    describe('CURSOR_AGENT set', () => {
      beforeEach(() => {
        vi.stubEnv('CURSOR_AGENT', '1');
      });

      it('detects', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq('cursor-cli');
      });
    });
  });

  describe('gemini detection', () => {
    describe('GEMINI_CLI not set', () => {
      it('is false', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq(false);
      });
    });

    describe('GEMINI_CLI set', () => {
      beforeEach(() => {
        vi.stubEnv('GEMINI_CLI', '1');
      });

      it('detects', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq('gemini');
      });
    });
  });

  describe('codex detection', () => {
    describe('CODEX_SANDBOX not set', () => {
      it('is false', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq(false);
      });
    });

    describe('CODEX_SANDBOX set', () => {
      beforeEach(() => {
        vi.stubEnv('CODEX_SANDBOX', 'seatbelt');
      });

      it('detects', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq('codex');
      });
    });
  });

  describe('claude detection', () => {
    describe('CLAUDE_CODE not set', () => {
      it('is false', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq(false);
      });
    });

    describe('CLAUDE_CODE set', () => {
      beforeEach(() => {
        vi.stubEnv('CLAUDE_CODE', '1');
      });

      it('detects', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq('claude');
      });
    });

    describe('CLAUDECODE set', () => {
      beforeEach(() => {
        vi.stubEnv('CLAUDECODE', '1');
      });

      it('detects', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq('claude');
      });
    });
  });

  describe('devin detection', () => {
    describe('/opt/.devin does not exist', () => {
      it('is false', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq(false);
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

      it('detects', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq('devin');
      });
    });
  });

  describe('replit detection', () => {
    describe('REPL_ID not set', () => {
      it('is false', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq(false);
      });
    });

    describe('REPL_ID set', () => {
      beforeEach(() => {
        vi.stubEnv('REPL_ID', '1');
      });

      it('detects', async () => {
        const agent = await determineAgent();
        expect(agent).to.eq('replit');
      });
    });
  });
});
