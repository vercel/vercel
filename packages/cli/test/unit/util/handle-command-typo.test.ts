import { join } from 'node:path';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleCommandTypo,
  handleUnknownCommand,
} from '../../../src/util/handle-command-typo';
import output from '../../../src/output-manager';

describe('handleCommandTypo', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(output, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false for flags', () => {
    expect(
      handleCommandTypo({
        command: '--prod',
        availableCommands: ['deploy'],
      })
    ).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('suggests the closest command for a typo', () => {
    expect(
      handleCommandTypo({
        command: 'deplyo',
        availableCommands: ['deploy', 'env', 'ls'],
      })
    ).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Did you mean')
    );
  });

  it('returns false when nothing is close', () => {
    expect(
      handleCommandTypo({
        command: 'instant-demo',
        availableCommands: ['deploy', 'env', 'ls'],
      })
    ).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('handleUnknownCommand', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let cwd: string;

  beforeEach(() => {
    errorSpy = vi.spyOn(output, 'error').mockImplementation(() => {});
    cwd = mkdtempSync(join(tmpdir(), 'vc-unknown-command-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false for flags without printing', () => {
    expect(
      handleUnknownCommand({
        command: '--prod',
        availableCommands: ['deploy'],
        cwd,
      })
    ).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('prints a typo suggestion when a close command exists', () => {
    expect(
      handleUnknownCommand({
        command: 'deplyo',
        availableCommands: ['deploy', 'env', 'ls'],
        cwd,
      })
    ).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Did you mean')
    );
  });

  it('prints an unknown command error when no directory exists', () => {
    expect(
      handleUnknownCommand({
        command: 'instant-demo',
        availableCommands: ['deploy', 'env', 'ls'],
        cwd,
      })
    ).toBe(true);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).toContain('is not a vercel command');
    expect(message).toContain('instant-demo');
    expect(message).toContain('exists to deploy');
    expect(message).toContain('help');
  });

  it('returns false when a matching directory exists', () => {
    mkdirSync(join(cwd, 'my-app'));
    expect(
      handleUnknownCommand({
        command: 'my-app',
        availableCommands: ['deploy', 'env', 'ls'],
        cwd,
      })
    ).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
