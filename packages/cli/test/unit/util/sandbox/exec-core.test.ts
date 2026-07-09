import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { startInteractiveShell } = vi.hoisted(() => ({
  startInteractiveShell: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../src/util/sandbox/interactive-shell', () => ({
  startInteractiveShell,
}));

import {
  assertInteractivePort,
  connectToSandbox,
  execInSandbox,
} from '../../../../src/util/sandbox/exec-core';

function fakeSandbox(overrides: Record<string, unknown> = {}) {
  return {
    name: 'my-sandbox',
    cwd: '/vercel/sandbox',
    interactivePort: 39821,
    runCommand: vi.fn().mockResolvedValue({ exitCode: 0 }),
    ...overrides,
  };
}

describe('execInSandbox', () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    startInteractiveShell.mockClear();
    startInteractiveShell.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it('runs a command non-interactively with stdout/stderr wired and sets process.exitCode', async () => {
    const sandbox = fakeSandbox({
      runCommand: vi.fn().mockResolvedValue({ exitCode: 0 }),
    });

    await execInSandbox({
      sandbox: sandbox as never,
      command: 'node',
      args: ['x.js'],
      cwd: '/app',
      env: { FOO: 'bar' },
      sudo: false,
      interactive: false,
      skipExtendingTimeout: false,
    });

    expect(sandbox.runCommand).toHaveBeenCalledWith({
      cmd: 'node',
      args: ['x.js'],
      stdout: process.stdout,
      stderr: process.stderr,
      sudo: false,
      cwd: '/app',
      env: { FOO: 'bar' },
      timeoutMs: undefined,
    });
    expect(process.exitCode).toBe(0);
  });

  it('prints the command echo to stderr before running', async () => {
    const sandbox = fakeSandbox();
    const consoleErrorSpy = vi.spyOn(console, 'error');

    await execInSandbox({
      sandbox: sandbox as never,
      command: 'echo',
      args: ['hi'],
      env: {},
      sudo: false,
      interactive: false,
      skipExtendingTimeout: false,
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('echo hi')
    );
  });

  it('passes ms(timeout) as timeoutMs when a timeout is given', async () => {
    const sandbox = fakeSandbox({
      runCommand: vi.fn().mockResolvedValue({ exitCode: 0 }),
    });

    await execInSandbox({
      sandbox: sandbox as never,
      command: 'sleep',
      args: ['10'],
      env: {},
      sudo: false,
      interactive: false,
      skipExtendingTimeout: false,
      timeout: '5s',
    });

    expect(sandbox.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 5000 })
    );
  });

  it('prints the SIGKILL note to stderr on exit code 137 with a timeout', async () => {
    const sandbox = fakeSandbox({
      runCommand: vi.fn().mockResolvedValue({ exitCode: 137 }),
    });
    const consoleErrorSpy = vi.spyOn(console, 'error');

    await execInSandbox({
      sandbox: sandbox as never,
      command: 'sleep',
      args: ['100'],
      env: {},
      sudo: false,
      interactive: false,
      skipExtendingTimeout: false,
      timeout: '1s',
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Command was killed (SIGKILL, exit code 137)')
    );
    expect(process.exitCode).toBe(137);
  });

  it('does not print the SIGKILL note on exit code 137 without a timeout', async () => {
    const sandbox = fakeSandbox({
      runCommand: vi.fn().mockResolvedValue({ exitCode: 137 }),
    });
    const consoleErrorSpy = vi.spyOn(console, 'error');

    await execInSandbox({
      sandbox: sandbox as never,
      command: 'sleep',
      args: ['100'],
      env: {},
      sudo: false,
      interactive: false,
      skipExtendingTimeout: false,
    });

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('SIGKILL')
    );
    expect(process.exitCode).toBe(137);
  });

  it('throws when interactive and timeout are both given', async () => {
    const sandbox = fakeSandbox();

    await expect(
      execInSandbox({
        sandbox: sandbox as never,
        command: 'sh',
        args: [],
        env: {},
        sudo: false,
        interactive: true,
        skipExtendingTimeout: false,
        timeout: '5s',
      })
    ).rejects.toThrow('--timeout cannot be combined with --interactive');

    expect(sandbox.runCommand).not.toHaveBeenCalled();
    expect(startInteractiveShell).not.toHaveBeenCalled();
  });

  it('throws when interactive is requested without a TTY', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
    });
    const sandbox = fakeSandbox();

    await expect(
      execInSandbox({
        sandbox: sandbox as never,
        command: 'sh',
        args: [],
        env: {},
        sudo: false,
        interactive: true,
        skipExtendingTimeout: false,
      })
    ).rejects.toThrow('--interactive flag requires a terminal (TTY)');

    expect(startInteractiveShell).not.toHaveBeenCalled();
  });

  it('delegates to startInteractiveShell when interactive and TTY are both satisfied', async () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
    const sandbox = fakeSandbox();

    await execInSandbox({
      sandbox: sandbox as never,
      command: 'bash',
      args: ['-l'],
      cwd: '/app',
      env: { FOO: 'bar' },
      sudo: true,
      interactive: true,
      skipExtendingTimeout: true,
    });

    expect(startInteractiveShell).toHaveBeenCalledWith({
      sandbox,
      cwd: '/app',
      execution: ['bash', '-l'],
      envVars: { FOO: 'bar' },
      sudo: true,
      skipExtendingTimeout: true,
    });
    expect(sandbox.runCommand).not.toHaveBeenCalled();
  });
});

describe('connectToSandbox', () => {
  beforeEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
    startInteractiveShell.mockClear();
    startInteractiveShell.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts an interactive sh shell with no cwd/env/sudo overrides', async () => {
    const sandbox = fakeSandbox();

    await connectToSandbox(sandbox as never);

    expect(startInteractiveShell).toHaveBeenCalledWith({
      sandbox,
      cwd: undefined,
      execution: ['sh'],
      envVars: {},
      sudo: false,
      skipExtendingTimeout: false,
    });
  });
});

describe('assertInteractivePort', () => {
  it('throws mentioning "created" when the sandbox has no interactive port', () => {
    const sandbox = fakeSandbox({ interactivePort: undefined });

    expect(() => assertInteractivePort(sandbox as never, 'created')).toThrow(
      /created/
    );
  });

  it('throws mentioning "forked" when the sandbox has no interactive port', () => {
    const sandbox = fakeSandbox({ interactivePort: undefined });

    expect(() => assertInteractivePort(sandbox as never, 'forked')).toThrow(
      /forked/
    );
  });

  it('does not throw when the sandbox has an interactive port', () => {
    const sandbox = fakeSandbox({ interactivePort: 39821 });

    expect(() =>
      assertInteractivePort(sandbox as never, 'created')
    ).not.toThrow();
  });
});
