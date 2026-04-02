import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  isActionRequiredPayload,
  outputActionRequired,
  outputAgentError,
  argvHasNonInteractive,
  exitWithNonInteractiveError,
  buildCommandWithScope,
  buildCommandWithYes,
  enrichActionRequiredWithInvokingCommand,
  type ActionRequiredPayload,
} from '../../../src/util/agent-output';
import { APIError, LinkRequiredError } from '../../../src/util/errors-ts';
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

  beforeEach(() => {
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as () => never) as unknown as {
      mockRestore: () => void;
    };
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('does nothing when client.nonInteractive is false', () => {
    const stdoutWrite = vi.fn();
    const client = {
      nonInteractive: false,
      stdout: { write: stdoutWrite },
      argv: ['/node', '/vc.js', 'deploy'],
    } as unknown as Client;

    outputActionRequired(client, payload);
    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('logs JSON and exits with default code when client.nonInteractive is true', () => {
    const stdoutWrite = vi.fn();
    const client = {
      nonInteractive: true,
      stdout: { write: stdoutWrite },
      argv: ['/node', '/vc.js', 'deploy'],
    } as unknown as Client;

    outputActionRequired(client, payload);
    expect(stdoutWrite).toHaveBeenCalledTimes(1);
    const written = String(stdoutWrite.mock.calls[0][0]);
    const parsed = JSON.parse(written);
    expect(parsed.status).toBe('action_required');
    expect(parsed.message).toBe(payload.message);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with custom exitCode when provided', () => {
    const stdoutWrite = vi.fn();
    const client = {
      nonInteractive: true,
      stdout: { write: stdoutWrite },
      argv: ['/node', '/vc.js', 'deploy'],
    } as unknown as Client;

    outputActionRequired(client, payload, 2);
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});

describe('outputAgentError', () => {
  const errorPayload = {
    status: 'error' as const,
    reason: 'test_reason',
    message: 'Something went wrong',
  };

  let exitSpy: { mockRestore: () => void };

  beforeEach(() => {
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as () => never) as unknown as {
      mockRestore: () => void;
    };
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('does nothing when client.nonInteractive is false', () => {
    const stdoutWrite = vi.fn();
    const client = {
      nonInteractive: false,
      stdout: { write: stdoutWrite },
    } as unknown as Client;

    outputAgentError(client, errorPayload);
    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('writes JSON and exits when client.nonInteractive is true', () => {
    const stdoutWrite = vi.fn();
    const client = {
      nonInteractive: true,
      stdout: { write: stdoutWrite },
    } as unknown as Client;

    outputAgentError(client, errorPayload, 3);
    expect(stdoutWrite).toHaveBeenCalledTimes(1);
    const written = String(stdoutWrite.mock.calls[0][0]);
    const parsed = JSON.parse(written);
    expect(parsed.status).toBe('error');
    expect(parsed.reason).toBe('test_reason');
    expect(parsed.message).toBe('Something went wrong');
    expect(exitSpy).toHaveBeenCalledWith(3);
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

  it('replaces --scope=value (equals-separated) with --scope', () => {
    const argv = ['/node', '/vc.js', 'deploy', '--scope=old-team'];
    expect(buildCommandWithScope(argv, 'new-team')).toBe(
      'vercel deploy --scope new-team'
    );
  });

  it('replaces --team=value (equals-separated) with --scope', () => {
    const argv = ['/node', '/vc.js', 'pull', '--team=old-team'];
    expect(buildCommandWithScope(argv, 'new-team')).toBe(
      'vercel pull --scope new-team'
    );
  });

  it('replaces -S shorthand with --scope', () => {
    const argv = ['/node', '/vc.js', 'deploy', '-S', 'old-team'];
    expect(buildCommandWithScope(argv, 'new-team')).toBe(
      'vercel deploy --scope new-team'
    );
  });

  it('replaces -T shorthand with --scope', () => {
    const argv = ['/node', '/vc.js', 'deploy', '-T', 'old-team'];
    expect(buildCommandWithScope(argv, 'new-team')).toBe(
      'vercel deploy --scope new-team'
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

  it('preserves --project and other flags in link command when present in argv', () => {
    const payload: ActionRequiredPayload = {
      status: 'action_required',
      message: 'Choose scope.',
      choices: [{ id: 'team_1', name: 'team-a' }],
      next: [],
    };
    const argv = ['/node', '/vc.js', 'link', '--project', 'my-app'];
    const out = enrichActionRequiredWithInvokingCommand(payload, argv);
    expect(out.next).toHaveLength(2);
    expect(out.next![0].command).toBe(
      'vercel link --project my-app --scope team-a'
    );
    expect(out.next![1].command).toBe(
      'vercel link --project my-app --scope team-a'
    );
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

describe('outputAgentError', () => {
  it('writes JSON including hint to stdout and exits when nonInteractive', () => {
    const stdoutWrite = vi.fn();
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);

    const client = {
      nonInteractive: true,
      stdout: { write: stdoutWrite },
    } as unknown as Client;
    outputAgentError(client, {
      status: 'error',
      reason: 'no_credentials',
      message: 'No credentials.',
      userActionRequired: true,
      hint: 'Use --token or VERCEL_TOKEN.',
      next: [{ command: 'vercel login', when: 'TTY only' }],
    });

    expect(stdoutWrite).toHaveBeenCalledTimes(1);
    const written = JSON.parse(stdoutWrite.mock.calls[0][0] as string);
    expect(written.status).toBe('error');
    expect(written.reason).toBe('no_credentials');
    expect(written.userActionRequired).toBe(true);
    expect(written.hint).toBe('Use --token or VERCEL_TOKEN.');
    expect(written.next).toHaveLength(1);
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it('does nothing when not nonInteractive', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('should not exit');
    }) as never);

    const client = {
      nonInteractive: false,
      argv: ['node', 'vc.js', 'login'],
    } as Client;
    outputAgentError(client, {
      status: 'error',
      reason: 'no_credentials',
      message: 'No credentials.',
    });

    expect(logSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe('argvHasNonInteractive', () => {
  it('detects --non-interactive', () => {
    expect(argvHasNonInteractive(['node', 'vc.js', 'project', 'ls'])).toBe(
      false
    );
    expect(
      argvHasNonInteractive([
        'node',
        'vc.js',
        'project',
        'ls',
        '--non-interactive',
      ])
    ).toBe(true);
    expect(
      argvHasNonInteractive([
        'node',
        'vc.js',
        '--non-interactive=false',
        'project',
        'ls',
      ])
    ).toBe(false);
  });
});

describe('exitWithNonInteractiveError', () => {
  it('emits JSON when argv includes --non-interactive even if client.nonInteractive is false', async () => {
    const { Response } = await import('node-fetch');
    const res = new Response(
      JSON.stringify({
        error: { code: 'not_found', message: 'Project not found.' },
      }),
      { status: 404 }
    );
    const err = new APIError('Project not found.', res);

    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as () => never);

    const chunks: string[] = [];
    const stdout = {
      write: (s: string) => {
        chunks.push(s);
        return true;
      },
    };

    const client = {
      nonInteractive: false,
      argv: ['node', 'vc.js', 'project', 'members', '--non-interactive'],
      stdout,
    } as unknown as Client;

    expect(() => exitWithNonInteractiveError(client, err, 1)).toThrow('exit:1');
    const payload = JSON.parse(chunks.join('').trim());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'project_not_found',
      message: 'Project not found.',
    });

    vi.restoreAllMocks();
  });

  it('emits link_required JSON for LinkRequiredError', () => {
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as () => never);

    const chunks: string[] = [];
    const stdout = {
      write: (s: string) => {
        chunks.push(s);
        return true;
      },
    };

    const client = {
      nonInteractive: true,
      argv: ['node', 'vc.js', 'project', 'members', '--non-interactive'],
      stdout,
    } as unknown as Client;

    expect(() =>
      exitWithNonInteractiveError(client, new LinkRequiredError(), 1, {
        variant: 'members',
      })
    ).toThrow('exit:1');
    const payload = JSON.parse(chunks.join('').trim());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'link_required',
    });

    vi.restoreAllMocks();
  });
});
