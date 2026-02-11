import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  isActionRequiredPayload,
  outputActionRequired,
  buildCommandWithScope,
  buildCommandWithYes,
  enrichActionRequiredWithInvokingCommand,
  type ActionRequiredPayload,
} from '../../../src/util/agent-output';
import type Client from '../../../src/util/client';

describe('isActionRequiredPayload', () => {
  it('returns true for valid ActionRequiredPayload', () => {
    const payload: ActionRequiredPayload = {
      status: 'action_required',
      message: 'Multiple teams available.',
      reason: 'missing_scope',
      choices: [{ id: 'team-1', name: 'Team One' }],
      next: [{ command: 'vercel link --scope team-1' }],
    };
    expect(isActionRequiredPayload(payload)).toBe(true);
  });

  it('returns true for minimal ActionRequiredPayload (only status and message)', () => {
    const payload = {
      status: 'action_required',
      message: 'Please choose a scope.',
    };
    expect(isActionRequiredPayload(payload)).toBe(true);
  });

  it('returns false for object with status "error"', () => {
    expect(
      isActionRequiredPayload({
        status: 'error',
        message: 'Something went wrong',
        reason: 'NOT_AUTHORIZED',
      })
    ).toBe(false);
  });

  it('returns false for object with status "linked"', () => {
    expect(
      isActionRequiredPayload({
        status: 'linked',
        org: {},
        project: {},
      })
    ).toBe(false);
  });

  it('returns false for null', () => {
    expect(isActionRequiredPayload(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isActionRequiredPayload(undefined)).toBe(false);
  });

  it('returns false for number', () => {
    expect(isActionRequiredPayload(0)).toBe(false);
    expect(isActionRequiredPayload(1)).toBe(false);
  });

  it('returns false for string', () => {
    expect(isActionRequiredPayload('action_required')).toBe(false);
  });

  it('returns false for object without status', () => {
    expect(
      isActionRequiredPayload({
        message: 'Multiple teams available.',
      })
    ).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isActionRequiredPayload({})).toBe(false);
  });
});

describe('outputActionRequired', () => {
  const payload: ActionRequiredPayload = {
    status: 'action_required',
    message: 'Choose a scope.',
    reason: 'missing_scope',
  };
  let exitSpy: { mockRestore: () => void };
  let logSpy: { mockRestore: () => void };

  beforeEach(() => {
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as () => never) as unknown as {
      mockRestore: () => void;
    };
    logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => {}) as unknown as { mockRestore: () => void };
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('does nothing when client.nonInteractive is false', () => {
    const client = { nonInteractive: false } as Client;
    outputActionRequired(client, payload);
    expect(logSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('logs JSON and exits with default code when client.nonInteractive is true', () => {
    const client = { nonInteractive: true } as Client;
    outputActionRequired(client, payload);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(payload, null, 2));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with custom exitCode when provided', () => {
    const client = { nonInteractive: true } as Client;
    outputActionRequired(client, payload, 2);
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});

describe('buildCommandWithYes', () => {
  it('appends --yes when argv has no --yes', () => {
    const argv = ['/node', '/vc.js', 'deploy', '--cwd=/path'];
    expect(buildCommandWithYes(argv)).toBe('vercel deploy --cwd=/path --yes');
  });

  it('keeps existing --yes when present', () => {
    const argv = ['/node', '/vc.js', 'deploy', '--yes'];
    expect(buildCommandWithYes(argv)).toBe('vercel deploy --yes');
  });

  it('keeps existing -y when present', () => {
    const argv = ['/node', '/vc.js', 'deploy', '-y'];
    expect(buildCommandWithYes(argv)).toBe('vercel deploy -y');
  });
});

describe('buildCommandWithScope', () => {
  it('appends --scope when argv has no scope', () => {
    const argv = ['/node', '/vc.js', 'deploy', '--yes'];
    expect(buildCommandWithScope(argv, 'my-team')).toBe(
      'vercel deploy --yes --scope my-team'
    );
  });

  it('replaces existing --scope with the given slug', () => {
    const argv = ['/node', '/vc.js', 'deploy', '--scope', 'old-team'];
    expect(buildCommandWithScope(argv, 'new-team')).toBe(
      'vercel deploy --scope new-team'
    );
  });

  it('replaces --team with --scope', () => {
    const argv = ['/node', '/vc.js', 'pull', '--team', 'old-team'];
    expect(buildCommandWithScope(argv, 'new-team')).toBe(
      'vercel pull --scope new-team'
    );
  });
});

describe('enrichActionRequiredWithInvokingCommand', () => {
  it('adds link and invoking command with scope for each choice', () => {
    const payload: ActionRequiredPayload = {
      status: 'action_required',
      message: 'Choose scope.',
      choices: [
        { id: 'team_1', name: 'team-a' },
        { id: 'team_2', name: 'team-b' },
      ],
      next: [],
    };
    const argv = ['/node', '/vc.js', 'deploy'];
    const out = enrichActionRequiredWithInvokingCommand(payload, argv);
    expect(out.next).toHaveLength(4);
    expect(out.next![0]).toEqual({
      command: 'vercel link --scope team-a',
      when: 'Link first (then run any command without --scope)',
    });
    expect(out.next![1].command).toBe('vercel deploy --scope team-a');
    expect(out.next![1].when).toBe('Run this command with scope (no link)');
    expect(out.next![2].command).toBe('vercel link --scope team-b');
    expect(out.next![3].command).toBe('vercel deploy --scope team-b');
  });

  it('returns payload unchanged when no choices', () => {
    const payload: ActionRequiredPayload = {
      status: 'action_required',
      message: 'Something.',
      next: [{ command: 'vercel login' }],
    };
    const out = enrichActionRequiredWithInvokingCommand(payload, []);
    expect(out).toBe(payload);
    expect(out.next).toHaveLength(1);
  });
});
