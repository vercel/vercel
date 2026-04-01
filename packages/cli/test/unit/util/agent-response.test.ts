import { describe, beforeEach, expect, it } from 'vitest';
import {
  writeAgentResponse,
  maybeAgentResponse,
} from '../../../src/util/agent-response';
import type { AgentResponse } from '../../../src/util/agent-response';
import type Client from '../../../src/util/client';

/**
 * Lightweight mock that satisfies the Client properties used by writeAgentResponse
 * without pulling in the full mock client (which has heavyweight transitive deps).
 */
function createMockClient(
  overrides: { nonInteractive?: boolean; argv?: string[] } = {}
) {
  let buffer = '';
  return {
    nonInteractive: overrides.nonInteractive ?? false,
    argv: overrides.argv ?? ['node', 'vercel'],
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

describe('writeAgentResponse', () => {
  let mock: MockClient;

  beforeEach(() => {
    mock = createMockClient({ nonInteractive: true });
  });

  it('writes JSON to stdout when nonInteractive is true', () => {
    const response: AgentResponse = {
      status: 'ok',
      message: 'Deployment complete',
      data: { url: 'https://example.vercel.app' },
    };

    const result = writeAgentResponse(mock as unknown as Client, response);

    expect(result).toBe(true);
    const parsed = JSON.parse(mock.getOutput());
    expect(parsed.status).toBe('ok');
    expect(parsed.message).toBe('Deployment complete');
    expect(parsed.data.url).toBe('https://example.vercel.app');
  });

  it('returns false and writes nothing when nonInteractive is false', () => {
    mock = createMockClient({ nonInteractive: false });
    const response: AgentResponse = {
      status: 'ok',
      message: 'Should not be written',
    };

    const result = writeAgentResponse(mock as unknown as Client, response);

    expect(result).toBe(false);
    expect(mock.getOutput()).toBe('');
  });

  it('outputs well-formed JSON with 2-space indent and trailing newline', () => {
    const response: AgentResponse = {
      status: 'error',
      reason: 'not_found',
      message: 'Not found',
    };

    writeAgentResponse(mock as unknown as Client, response);

    expect(mock.getOutput()).toBe(JSON.stringify(response, null, 2) + '\n');
  });

  it('adds default hint for action_required with next[]', () => {
    const response: AgentResponse = {
      status: 'action_required',
      reason: 'missing_arguments',
      message: 'Missing --project flag',
      next: [{ command: 'vercel link --project my-app', when: 'link project' }],
    };

    writeAgentResponse(mock as unknown as Client, response);

    const parsed = JSON.parse(mock.getOutput());
    expect(parsed.hint).toBe(
      'Run one of the commands in next[] to complete without prompting.'
    );
  });

  it('adds default hint for error with next[]', () => {
    const response: AgentResponse = {
      status: 'error',
      reason: 'not_linked',
      message: 'Project is not linked',
      next: [{ command: 'vercel link' }],
    };

    writeAgentResponse(mock as unknown as Client, response);

    const parsed = JSON.parse(mock.getOutput());
    expect(parsed.hint).toBe(
      'Run one of the commands in next[] to complete without prompting.'
    );
  });

  it('does not override an existing hint', () => {
    const response: AgentResponse = {
      status: 'action_required',
      reason: 'login_required',
      message: 'Login required',
      hint: 'A human must visit the URL',
      next: [{ command: 'open https://vercel.com/device' }],
    };

    writeAgentResponse(mock as unknown as Client, response);

    const parsed = JSON.parse(mock.getOutput());
    expect(parsed.hint).toBe('A human must visit the URL');
  });

  it('does not add hint for ok status even with next[]', () => {
    const response: AgentResponse = {
      status: 'ok',
      message: 'Done',
      next: [{ command: 'vercel deploy', when: 'deploy the project' }],
    };

    writeAgentResponse(mock as unknown as Client, response);

    const parsed = JSON.parse(mock.getOutput());
    expect(parsed.hint).toBeUndefined();
  });

  it('does not add hint for dry_run status', () => {
    const response: AgentResponse = {
      status: 'dry_run',
      reason: 'dry_run_ok',
      message: 'Would deploy to production',
      next: [{ command: 'vercel deploy --prod' }],
    };

    writeAgentResponse(mock as unknown as Client, response);

    const parsed = JSON.parse(mock.getOutput());
    expect(parsed.hint).toBeUndefined();
  });

  it('enriches action_required with choices via enrichActionRequiredWithInvokingCommand', () => {
    mock = createMockClient({
      nonInteractive: true,
      argv: ['node', 'vercel', 'deploy', '--non-interactive'],
    });
    const response: AgentResponse = {
      status: 'action_required',
      reason: 'missing_scope',
      message: 'Select a team',
      choices: [
        { id: 'team_1', name: 'my-team' },
        { id: 'team_2', name: 'other-team' },
      ],
    };

    writeAgentResponse(mock as unknown as Client, response);

    const parsed = JSON.parse(mock.getOutput());
    expect(parsed.next).toBeDefined();
    expect(parsed.next.length).toBeGreaterThan(0);
    const commands = parsed.next.map((n: { command: string }) => n.command);
    expect(commands.some((c: string) => c.includes('--scope'))).toBe(true);
  });

  it('preserves data field when enriching action_required with choices', () => {
    mock = createMockClient({
      nonInteractive: true,
      argv: ['node', 'vercel', 'link', '--non-interactive'],
    });
    const response: AgentResponse = {
      status: 'action_required',
      reason: 'missing_scope',
      message: 'Select a team',
      choices: [{ id: 'team_1', name: 'my-team' }],
      data: { extra: 'info' },
    };

    writeAgentResponse(mock as unknown as Client, response);

    const parsed = JSON.parse(mock.getOutput());
    expect(parsed.data).toEqual({ extra: 'info' });
  });

  it('handles all status types', () => {
    const statuses: AgentResponse['status'][] = [
      'ok',
      'error',
      'action_required',
      'dry_run',
    ];

    for (const status of statuses) {
      const m = createMockClient({ nonInteractive: true });
      writeAgentResponse(m as unknown as Client, {
        status,
        message: `Test ${status}`,
      });
      const parsed = JSON.parse(m.getOutput());
      expect(parsed.status).toBe(status);
    }
  });

  it('includes optional fields only when provided', () => {
    const response: AgentResponse = {
      status: 'action_required',
      reason: 'login_required',
      message: 'Login required',
      userActionRequired: true,
      verification_uri: 'https://vercel.com/device',
      missing: ['token'],
    };

    writeAgentResponse(mock as unknown as Client, response);

    const parsed = JSON.parse(mock.getOutput());
    expect(parsed.userActionRequired).toBe(true);
    expect(parsed.verification_uri).toBe('https://vercel.com/device');
    expect(parsed.missing).toEqual(['token']);
  });
});

describe('maybeAgentResponse', () => {
  it('returns exit code when nonInteractive is true', () => {
    const mock = createMockClient({ nonInteractive: true });
    const result = maybeAgentResponse(
      mock as unknown as Client,
      { status: 'error', reason: 'api_error', message: 'API failed' },
      1
    );

    expect(result).toBe(1);
    const parsed = JSON.parse(mock.getOutput());
    expect(parsed.status).toBe('error');
  });

  it('returns null when nonInteractive is false', () => {
    const mock = createMockClient({ nonInteractive: false });
    const result = maybeAgentResponse(
      mock as unknown as Client,
      { status: 'error', reason: 'api_error', message: 'API failed' },
      1
    );

    expect(result).toBeNull();
    expect(mock.getOutput()).toBe('');
  });

  it('returns the provided exit code value', () => {
    const mock0 = createMockClient({ nonInteractive: true });
    expect(
      maybeAgentResponse(
        mock0 as unknown as Client,
        { status: 'ok', message: 'Success' },
        0
      )
    ).toBe(0);

    const mock2 = createMockClient({ nonInteractive: true });
    expect(
      maybeAgentResponse(
        mock2 as unknown as Client,
        { status: 'error', reason: 'auth_error', message: 'Auth failed' },
        2
      )
    ).toBe(2);
  });
});
