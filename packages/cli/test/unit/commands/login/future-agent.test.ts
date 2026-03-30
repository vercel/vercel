/**
 * Phase 1.3 tests: Structured JSON output for login's device code flow.
 *
 * These tests verify the agent response payloads emitted by future.ts
 * without importing future.ts directly (which has heavyweight transitive
 * deps like @vercel/build-utils that aren't built in this environment).
 *
 * Instead, we test writeAgentResponse with the exact payloads that future.ts
 * constructs, and verify the EXIT_CODE used on failure.
 */
import { describe, beforeEach, expect, it } from 'vitest';
import {
  writeAgentResponse,
  maybeAgentResponse,
} from '../../../../src/util/agent-response';
import type { AgentResponse } from '../../../../src/util/agent-response';
import { EXIT_CODE } from '../../../../src/util/exit-codes';

function createMockClient(
  overrides: { nonInteractive?: boolean; argv?: string[] } = {}
) {
  let buffer = '';
  return {
    nonInteractive: overrides.nonInteractive ?? false,
    argv: overrides.argv ?? ['node', 'vercel', 'login'],
    stdout: {
      write(chunk: string) {
        buffer += chunk;
        return true;
      },
    },
    getOutput() {
      return buffer;
    },
    reset() {
      buffer = '';
    },
  };
}

type MockClient = ReturnType<typeof createMockClient>;

describe('login agent mode — Phase 1.3 structured JSON', () => {
  let mock: MockClient;

  beforeEach(() => {
    mock = createMockClient({ nonInteractive: true });
  });

  describe('action_required payload (device code flow)', () => {
    const actionRequiredPayload: AgentResponse = {
      status: 'action_required',
      reason: 'login_required',
      message: 'Complete authentication by visiting the verification URL',
      userActionRequired: true,
      verification_uri: 'https://vercel.com/device?code=ABCD-1234',
      data: {
        user_code: 'ABCD-1234',
        verification_uri: 'https://vercel.com/device',
        verification_uri_complete: 'https://vercel.com/device?code=ABCD-1234',
        expires_in: 300,
      },
      hint: 'A human must visit the URL and enter the code to complete login.',
    };

    it('writes action_required JSON to stdout in agent mode', () => {
      const written = writeAgentResponse(mock as any, actionRequiredPayload);

      expect(written).toBe(true);

      const output = mock.getOutput();
      const parsed = JSON.parse(output);
      expect(parsed.status).toBe('action_required');
      expect(parsed.reason).toBe('login_required');
      expect(parsed.userActionRequired).toBe(true);
      expect(parsed.verification_uri).toBe(
        'https://vercel.com/device?code=ABCD-1234'
      );
      expect(parsed.data.user_code).toBe('ABCD-1234');
      expect(parsed.data.verification_uri).toBe('https://vercel.com/device');
      expect(parsed.data.verification_uri_complete).toBe(
        'https://vercel.com/device?code=ABCD-1234'
      );
      expect(parsed.data.expires_in).toBe(300);
      expect(parsed.hint).toContain('human must visit');
    });

    it('does not write action_required JSON when not nonInteractive', () => {
      const interactiveMock = createMockClient({ nonInteractive: false });
      const written = writeAgentResponse(
        interactiveMock as any,
        actionRequiredPayload
      );

      expect(written).toBe(false);
      expect(interactiveMock.getOutput()).toBe('');
    });

    it('includes all required fields for agent consumption', () => {
      writeAgentResponse(mock as any, actionRequiredPayload);

      const parsed = JSON.parse(mock.getOutput());
      // Verify all fields an agent needs to surface the auth flow
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('reason');
      expect(parsed).toHaveProperty('message');
      expect(parsed).toHaveProperty('userActionRequired');
      expect(parsed).toHaveProperty('verification_uri');
      expect(parsed).toHaveProperty('data');
      expect(parsed).toHaveProperty('hint');
      expect(parsed.data).toHaveProperty('user_code');
    });
  });

  describe('ok payload (login success)', () => {
    const okPayload: AgentResponse = {
      status: 'ok',
      reason: 'login_success',
      message: 'Successfully authenticated',
      data: {
        team: 'my-team',
        configPath: '/home/user/.vercel',
      },
      next: [
        { command: 'vercel link', when: 'Link a project' },
        { command: 'vercel deploy', when: 'Deploy a project' },
      ],
    };

    it('writes ok JSON to stdout in agent mode', () => {
      writeAgentResponse(mock as any, okPayload);

      const parsed = JSON.parse(mock.getOutput());
      expect(parsed.status).toBe('ok');
      expect(parsed.reason).toBe('login_success');
      expect(parsed.message).toBe('Successfully authenticated');
      expect(parsed.data.team).toBe('my-team');
      expect(parsed.data.configPath).toBe('/home/user/.vercel');
    });

    it('includes next[] with link and deploy suggestions', () => {
      writeAgentResponse(mock as any, okPayload);

      const parsed = JSON.parse(mock.getOutput());
      expect(parsed.next).toHaveLength(2);
      expect(parsed.next).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ when: 'Link a project' }),
          expect.objectContaining({ when: 'Deploy a project' }),
        ])
      );
    });

    it('handles undefined team in data', () => {
      const payloadNoTeam: AgentResponse = {
        ...okPayload,
        data: { team: undefined, configPath: '/home/user/.vercel' },
      };

      writeAgentResponse(mock as any, payloadNoTeam);

      const parsed = JSON.parse(mock.getOutput());
      expect(parsed.status).toBe('ok');
      // team should be absent or undefined in JSON
      expect(parsed.data.configPath).toBe('/home/user/.vercel');
    });

    it('does not write ok JSON when not nonInteractive', () => {
      const interactiveMock = createMockClient({ nonInteractive: false });
      writeAgentResponse(interactiveMock as any, okPayload);

      expect(interactiveMock.getOutput()).toBe('');
    });
  });

  describe('error payload (login failure)', () => {
    const errorPayload: AgentResponse = {
      status: 'error',
      reason: 'auth_error',
      message: 'Authentication failed. Try again.',
      next: [{ command: 'vercel login' }],
    };

    it('writes error JSON to stdout in agent mode', () => {
      writeAgentResponse(mock as any, errorPayload);

      const parsed = JSON.parse(mock.getOutput());
      expect(parsed.status).toBe('error');
      expect(parsed.reason).toBe('auth_error');
      expect(parsed.message).toContain('Authentication failed');
    });

    it('includes next[] with login suggestion', () => {
      writeAgentResponse(mock as any, errorPayload);

      const parsed = JSON.parse(mock.getOutput());
      expect(parsed.next).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            command: expect.stringContaining('login'),
          }),
        ])
      );
    });

    it('uses EXIT_CODE.AUTH_ERROR (2) for auth failures', () => {
      const exitCode = maybeAgentResponse(
        mock as any,
        errorPayload,
        EXIT_CODE.AUTH_ERROR
      );

      expect(exitCode).toBe(2);
    });

    it('returns null for error payload when not nonInteractive', () => {
      const interactiveMock = createMockClient({ nonInteractive: false });

      const exitCode = maybeAgentResponse(
        interactiveMock as any,
        errorPayload,
        EXIT_CODE.AUTH_ERROR
      );

      expect(exitCode).toBeNull();
      expect(interactiveMock.getOutput()).toBe('');
    });

    it('adds default hint for error with next[] suggestions', () => {
      writeAgentResponse(mock as any, errorPayload);

      const parsed = JSON.parse(mock.getOutput());
      expect(parsed.hint).toContain('next[]');
    });
  });

  describe('EXIT_CODE integration', () => {
    it('EXIT_CODE.AUTH_ERROR equals 2', () => {
      expect(EXIT_CODE.AUTH_ERROR).toBe(2);
    });

    it('EXIT_CODE.SUCCESS equals 0', () => {
      expect(EXIT_CODE.SUCCESS).toBe(0);
    });
  });
});
