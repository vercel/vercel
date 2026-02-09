import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  isActionRequiredPayload,
  outputActionRequired,
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
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(payload));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with custom exitCode when provided', () => {
    const client = { nonInteractive: true } as Client;
    outputActionRequired(client, payload, 2);
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});
