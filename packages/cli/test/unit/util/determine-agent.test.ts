import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { determineAgent } from '../../../src/util/determine-agent';
import mockFs from 'mock-fs';

vi.setConfig({ testTimeout: 6 * 60 * 1000 });

describe('checkTelemetryStatus', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mockFs.restore();
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
});
